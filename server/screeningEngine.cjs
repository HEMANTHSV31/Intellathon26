/**
 * Backend Diabetic Retinopathy Screening Engine
 *
 * Executes server-side fundus image quality verification, lesion morphology analysis,
 * ICDR disease staging, and clinical severity triage (HIGH / MEDIUM / LOW).
 * Enables lightweight client devices to offload full clinical screening to the server.
 */
'use strict';

const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');

/**
 * Decode Base64 data URL or raw buffer to RGBA pixel array
 */
function decodeImage(input) {
  let buffer;
  let isPng = false;

  if (Buffer.isBuffer(input)) {
    buffer = input;
    // Check PNG signature: 89 50 4E 47
    if (buffer.length > 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      isPng = true;
    }
  } else if (typeof input === 'string') {
    if (input.includes('data:image/png')) isPng = true;
    const base64Data = input.replace(/^data:image\/\w+;base64,/, '');
    buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      isPng = true;
    }
  } else {
    throw new Error('Unsupported image input format');
  }

  if (isPng) {
    const png = PNG.sync.read(buffer);
    return {
      width: png.width,
      height: png.height,
      data: png.data // Buffer of RGBA
    };
  } else {
    // Default to JPEG
    const raw = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });
    return {
      width: raw.width,
      height: raw.height,
      data: raw.data
    };
  }
}

/**
 * Fast separable box blur for background subtraction
 */
function boxBlur(src, w, h, radius) {
  if (radius <= 0) return src.slice();
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const win = 2 * radius + 1;
  const inv = 1 / win;
  const wLast = w - 1;
  const hLast = h - 1;

  for (let y = 0; y < h; y++) {
    const rowOff = y * w;
    let sum = 0;
    for (let k = -radius; k <= radius; k++) {
      let xx = k < 0 ? 0 : k > wLast ? wLast : k;
      sum += src[rowOff + xx];
    }
    tmp[rowOff] = sum * inv;
    for (let x = 1; x < w; x++) {
      let a = x + radius > wLast ? wLast : x + radius;
      let b = x - radius - 1 < 0 ? 0 : x - radius - 1;
      sum += src[rowOff + a] - src[rowOff + b];
      tmp[rowOff + x] = sum * inv;
    }
  }

  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) {
      let yy = k < 0 ? 0 : k > hLast ? hLast : k;
      sum += tmp[yy * w + x];
    }
    out[x] = sum * inv;
    for (let y = 1; y < h; y++) {
      let a = y + radius > hLast ? hLast : y + radius;
      let b = y - radius - 1 < 0 ? 0 : y - radius - 1;
      sum += tmp[a * w + x] - tmp[b * w + x];
      out[y * w + x] = sum * inv;
    }
  }

  return out;
}

/**
 * Run complete backend screening on the image
 */
async function runBackendScreening(imageInput, meta = {}) {
  const startTime = Date.now();

  // 1. Decode Image
  let decoded;
  try {
    decoded = decodeImage(imageInput);
  } catch (err) {
    return {
      success: false,
      qualityVerdict: 'reject',
      qualityReason: 'Corrupted image file: ' + err.message,
      severityLevel: 'LOW',
      referable: false
    };
  }

  const { width: origW, height: origH, data } = decoded;

  // 2. Minimum Resolution Gate
  if (origW < 256 || origH < 256) {
    return {
      success: false,
      qualityVerdict: 'reject',
      qualityReason: `Image resolution (${origW}×${origH} px) is below minimum 256×256 px threshold and cannot be upscaled with diagnostic reliability.`,
      severityLevel: 'LOW',
      referable: false
    };
  }

  // 3. Subsample to standard 400px working dimension for fast, deterministic server-side analysis
  const scale = Math.min(1, 400 / Math.max(origW, origH));
  const w = Math.max(64, Math.round(origW * scale));
  const h = Math.max(64, Math.round(origH * scale));
  const n = w * h;

  const green = new Float32Array(n);
  const lum = new Float32Array(n);

  // Bilinear/Nearest sampling to downsampled grid
  for (let y = 0; y < h; y++) {
    const srcY = Math.min(origH - 1, Math.floor(y / scale));
    const rowOff = y * w;
    const srcRowOff = srcY * origW;
    for (let x = 0; x < w; x++) {
      const srcX = Math.min(origW - 1, Math.floor(x / scale));
      const idx = (srcRowOff + srcX) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      green[rowOff + x] = g;
      lum[rowOff + x] = l;
    }
  }

  // 4. Focus Measure (Laplacian Variance)
  let lapSum = 0;
  let lapN = 0;
  const lap = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const v = lum[idx - 1] + lum[idx + 1] + lum[idx - w] + lum[idx + w] - 4 * lum[idx];
      lap[idx] = v;
      lapSum += v;
      lapN++;
    }
  }
  const lapMean = lapN ? lapSum / lapN : 0;
  let lapSumSq = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const diff = lap[y * w + x] - lapMean;
      lapSumSq += diff * diff;
    }
  }
  const focusVar = lapN ? lapSumSq / lapN : 0;

  // Brightness stats & Field of View
  let brightSum = 0;
  let nonBlack = 0;
  for (let i = 0; i < n; i++) {
    brightSum += lum[i];
    if (lum[i] > 15) nonBlack++;
  }
  const brightMean = brightSum / n;
  const fov = nonBlack / n;

  // Quality Rejection Thresholds
  if (fov < 0.30) {
    return {
      success: false,
      qualityVerdict: 'reject',
      qualityReason: `Insufficient retinal field of view (${(fov * 100).toFixed(0)}% non-black)`,
      metrics: { focusVar, brightMean, fov },
      severityLevel: 'LOW',
      referable: false
    };
  }
  if (brightMean < 30) {
    return {
      success: false,
      qualityVerdict: 'reject',
      qualityReason: `Mean illumination too dark (${brightMean.toFixed(1)}/255)`,
      metrics: { focusVar, brightMean, fov },
      severityLevel: 'LOW',
      referable: false
    };
  }
  if (brightMean > 240) {
    return {
      success: false,
      qualityVerdict: 'reject',
      qualityReason: `Photograph severely overexposed (${brightMean.toFixed(1)}/255)`,
      metrics: { focusVar, brightMean, fov },
      severityLevel: 'LOW',
      referable: false
    };
  }
  if (focusVar < 14.0) {
    return {
      success: false,
      qualityVerdict: 'reject',
      qualityReason: `Severe focus blur detected (Focus score: ${focusVar.toFixed(1)} < 14.0)`,
      metrics: { focusVar, brightMean, fov },
      severityLevel: 'LOW',
      referable: false
    };
  }

  // 5. Morphological Lesion Analysis
  // Background estimate
  const bgRadius = Math.max(4, Math.round(Math.min(w, h) / 16));
  const bg = boxBlur(green, w, h, bgRadius);

  let microaneurysms = 0;
  let hemorrhages = 0;
  let hardExudates = 0;
  let cottonWoolSpots = 0;

  // Identify candidate structures against retinal field
  for (let y = bgRadius; y < h - bgRadius; y += 2) {
    for (let x = bgRadius; x < w - bgRadius; x += 2) {
      const idx = y * w + x;
      if (lum[idx] < 20) continue; // Outside aperture

      const diff = green[idx] - bg[idx];

      // Dark lesions (Green channel dips significantly below local retinal mean)
      if (diff < -14) {
        if (diff < -28) {
          hemorrhages++;
        } else {
          microaneurysms++;
        }
      }
      // Bright lesions (Lipid exudate or cotton wool ischemia)
      else if (diff > 16) {
        const edgeContrast = Math.abs(green[idx] - green[idx + 1]) + Math.abs(green[idx] - green[idx + w]);
        if (edgeContrast > 15) {
          hardExudates++;
        } else {
          cottonWoolSpots++;
        }
      }
    }
  }

  // Normalize lesion counts to avoid duplicate grid hits
  microaneurysms = Math.min(80, Math.round(microaneurysms / 4));
  hemorrhages = Math.min(45, Math.round(hemorrhages / 6));
  hardExudates = Math.min(90, Math.round(hardExudates / 5));
  cottonWoolSpots = Math.min(25, Math.round(cottonWoolSpots / 7));

  const totalLesions = microaneurysms + hemorrhages + hardExudates + cottonWoolSpots;

  // 6. Compute DR Softmax Probability
  // Logistic regression scoring function based on weighted lesion presence
  const logit = -2.4 + (microaneurysms * 0.40) + (hemorrhages * 0.65) + (hardExudates * 0.50) + (cottonWoolSpots * 0.70);
  const drSoftmax = Math.min(0.99, Math.max(0.02, 1 / (1 + Math.exp(-logit))));
  const confidence = Math.max(drSoftmax, 1 - drSoftmax);

  // 7. Clinical Staging & Severity Level Triage (HIGH / MEDIUM / LOW)
  let icdrGrade;
  let severityLevel;
  let referable;
  let recommendations = [];

  if (cottonWoolSpots >= 3 || hemorrhages >= 8 || totalLesions >= 18 || drSoftmax >= 0.75) {
    icdrGrade = 'Severe Nonproliferative DR (Stage 3)';
    severityLevel = 'HIGH';
    referable = true;
    recommendations = [
      'Urgent ophthalmologist evaluation recommended within 2 to 4 weeks.',
      'Comprehensive dilated fundus examination with optical coherence tomography (OCT) indicated.',
      'Evaluate for macular edema and proliferative neovascularization risk.'
    ];
  } else if (totalLesions >= 4 || hardExudates >= 2 || hemorrhages >= 2 || (drSoftmax >= 0.38 && drSoftmax < 0.75)) {
    icdrGrade = 'Moderate Nonproliferative DR (Stage 2)';
    severityLevel = 'MEDIUM';
    referable = true;
    recommendations = [
      'Ophthalmology review recommended within 4 to 8 weeks.',
      'Optimize glycemic control (HbA1c target), blood pressure, and renal function.',
      'Repeat photographic screening in 6 months.'
    ];
  } else if (microaneurysms >= 1) {
    icdrGrade = 'Mild Nonproliferative DR (Stage 1)';
    severityLevel = microaneurysms >= 3 ? 'MEDIUM' : 'LOW';
    referable = false;
    recommendations = [
      'Early microvascular changes observed without macular threat.',
      'Annual diabetic retinal screening recommended.',
      'Reinforce strict blood glucose control with primary care physician.'
    ];
  } else {
    icdrGrade = 'No Apparent Retinopathy (Stage 0)';
    severityLevel = 'LOW';
    referable = false;
    recommendations = [
      'Retinal microvasculature within normal limits.',
      'Annual routine screening recommended per clinical guidelines.'
    ];
  }

  const prediction = drSoftmax >= 0.5 ? 'Referable DR Detected' : 'No DR Detected';
  const elapsedMs = Date.now() - startTime;

  return {
    success: true,
    prediction,
    drSoftmax: Number(drSoftmax.toFixed(3)),
    confidence: Number(confidence.toFixed(3)),
    drScore: Number(drSoftmax.toFixed(3)),
    icdrGrade,
    severityLevel, // 'HIGH' | 'MEDIUM' | 'LOW'
    referable,
    recommendations,
    lesionCounts: {
      microaneurysms,
      hemorrhages,
      hardExudates,
      cottonWoolSpots
    },
    qualityVerdict: 'ok',
    qualityReason: '',
    metrics: {
      focusVar: Number(focusVar.toFixed(1)),
      brightMean: Number(brightMean.toFixed(1)),
      fov: Number(fov.toFixed(2))
    },
    elapsedMs
  };
}

module.exports = {
  decodeImage,
  runBackendScreening
};
