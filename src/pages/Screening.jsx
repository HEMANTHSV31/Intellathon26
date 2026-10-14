import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { initScreening } from '../utils/drEngine'

export default function Screening() {
  useEffect(() => {
    const cleanup = initScreening()
    return () => {
      if (typeof cleanup === 'function') cleanup()
    }
  }, [])

  return (
    <>
      <header className="app-header">
        <h1>Diabetic Retinopathy Screening</h1>
        <p className="subtitle">
          Client-side screening and explainability for primary health centre fundus photography. Capacity planning lives on the{' '}
          <Link to="/pipeline">capacity model</Link> page.
        </p>
        <div id="model-status">Loading classifier model…</div>
        <progress id="model-progress" max="1"></progress>
      </header>

      {/* 1. UPLOADER */}
      <section id="uploader">
        <h2>1. Upload a fundus image</h2>
        <div className="upload-box">
          <input type="file" id="file-input" accept="image/*" />
          <div className="actions">
            <button id="run-button" disabled type="button">Run screening pipeline</button>
          </div>
          <p className="field-note">Images are downsampled to a maximum of 800px on the longest side before processing, for speed. Nothing is uploaded anywhere — all computation runs in this browser tab.</p>
        </div>
      </section>

      {/* STEP 1: RESULTS */}
      <section id="step1" className="step">
        <hr className="rule" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span className="pill">Step 1</span>
          <span className="small" style={{ color: '#64748b' }}>Results: Focus &amp; Illumination Gate</span>
        </div>
        <h2>Image quality assessment &amp; enhancement</h2>
        
        <div className="canvas-row">
          <div className="canvas-col">
            <canvas id="canvas-original"></canvas>
            <div className="cap">As uploaded (resized for processing)</div>
          </div>
          <div className="canvas-col">
            <canvas id="canvas-enhanced"></canvas>
            <div className="cap">After enhancement (if applied)</div>
          </div>
        </div>
        
        <table className="kv" id="quality-table"></table>
        <div id="quality-notice"></div>
      </section>

      {/* STEP 2: RESULTS */}
      <section id="step2" className="step">
        <hr className="rule" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span className="pill">Step 2</span>
          <span className="small" style={{ color: '#64748b' }}>Results: Deep Learning Inference</span>
        </div>
        <h2>DR classification</h2>
        <div id="model-scope-notice" className="notice"></div>
        <div id="grading-results"></div>
      </section>

      {/* STEP 3: RESULTS */}
      <section id="step3" className="step">
        <hr className="rule" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span className="pill">Step 3</span>
          <span className="small" style={{ color: '#64748b' }}>Results: Explainability &amp; Landmarks</span>
        </div>
        <h2>Explainability — Grad-CAM &amp; Anatomical Landmarks</h2>

        <h3>3a. Attention gradient with marked regions</h3>
        <div className="canvas-row">
          <div className="canvas-col">
            <canvas id="canvas-gradcam-colour"></canvas>
            <div className="cap">Grad-CAM in colour tones</div>
          </div>
          <div className="canvas-col">
            <canvas id="canvas-gradcam"></canvas>
            <div className="cap">The same gradient in greyscale</div>
          </div>
        </div>
        <div className="cbar"></div>
        <div className="cbar-ends"><span>low attention</span><span>high attention</span></div>
        <div id="findings-legend"></div>
        <p id="gradcam-note"></p>

        <h3>3b. Anatomical landmarks, eye lateralization &amp; quadrants</h3>
        <div className="canvas-row">
          <div className="canvas-col">
            <canvas id="canvas-anatomy"></canvas>
            <div className="cap">Estimated landmarks with balanced quadrant axes.</div>
          </div>
        </div>
        <table className="kv" id="anatomy-table"></table>
      </section>

      {/* STEP 4: RESULTS */}
      <section id="step4" className="step">
        <hr className="rule" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span className="pill">Step 4</span>
          <span className="pill" style={{ background: '#0284c7', color: '#ffffff', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            MATLAB Image Processing Suite (+dr)
          </span>
        </div>
        <h2>Lesion candidate mask &amp; candidate localization</h2>
        <div style={{ background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.08) 0%, rgba(56, 189, 248, 0.04) 100%)', border: '1px solid rgba(2, 132, 199, 0.25)', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '0.86rem', color: '#0369a1' }}>
          <strong>High-Precision Morphology:</strong> Multi-scale directional top-hat morphology, ray-tracing vessel suppression, and perimacular tolerance for cotton wool spots and microaneurysms (<code style={{ background: 'rgba(2, 132, 199, 0.1)', padding: '2px 4px', borderRadius: '4px' }}>matlab/+dr/detectLesionCandidates.m</code>).
        </div>

        <div className="canvas-row">
          <div className="canvas-col">
            <canvas id="canvas-mask"></canvas>
            <div className="cap">Binary mask — white pixels are candidate lesion pixels</div>
          </div>
          <div className="canvas-col">
            <canvas id="canvas-mask-typed"></canvas>
            <div className="cap">Same mask, shaded by candidate type</div>
          </div>
          <div className="canvas-col">
            <canvas id="canvas-lesion-overlay"></canvas>
            <div className="cap">Candidates located on the fundus image</div>
          </div>
        </div>

        <div id="lesion-legend"></div>
        <div id="lesion-summary"></div>
        <div id="lesion-quadrants"></div>
      </section>

      {/* STEP 5: RESULTS */}
      <section id="severity" className="step">
        <hr className="rule" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span className="pill">Step 5</span>
          <span className="small" style={{ color: '#64748b' }}>Results: Clinical Rule Application</span>
        </div>
        <h2>ICDR severity estimate</h2>
        <div id="grade-result"></div>
        <div id="grade-quadrants"></div>
      </section>

      {/* SUMMARY REPORT */}
      <section id="report" className="step">
        <hr className="rule" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span className="pill">Summary</span>
          <div className="actions no-print" style={{ margin: 0 }}>
            <button id="print-button" type="button">Print report</button>
          </div>
        </div>
        <h2>Screening report</h2>
        <div id="report-body"></div>
      </section>

      {/* REFERRAL ALERT BANNER */}
      <div className="refer-banner" id="refer-banner" role="alert" aria-live="polite">
        <strong>Ask an ophthalmologist</strong>
        <span id="refer-reason"></span>
      </div>

      {/* ========================================================================= */}
      {/* EXPLAINING CONTENT & CLINICAL METHODOLOGY AT THE BOTTOM OF THE PAGE       */}
      {/* ========================================================================= */}
      <section id="clinical-methodology-reference" className="step" style={{ marginTop: '3.5rem', background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <hr className="rule" />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
          <span className="pill" style={{ background: '#475569', color: '#fff' }}>Reference Guide</span>
          <h2 style={{ margin: 0 }}>Clinical Methodology, Detection Mechanics &amp; Sensitivity Tuning</h2>
        </div>
        <p className="notice" style={{ marginTop: '0.5rem' }}>
          All in-depth mathematical formulations, lesion typing rules, sensitivity controls, and explainability notes are compiled below for clinical review and research audit.
        </p>

        {/* 1. Interactive Tuning Controls */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginTop: '1.5rem' }}>
          {/* Lesion Detection Tuning */}
          <div className="tune-box" style={{ margin: 0 }}>
            <h3 style={{ marginTop: 0 }}>Step 4: Lesion detection sensitivity</h3>
            <p className="small">These thresholds control morphological sensitivity across the retinal field. Changing them re-runs only Step 4 without re-running the neural network.</p>
            <label className="field">
              Dark-lesion sensitivity floor
              <input type="number" id="tune-dark" defaultValue="8" step="0.5" min="1" max="40" />
            </label>
            <div className="field-note">Floor in grey levels below which a dark region is never seeded. Working cut is adaptive to response distribution.</div>
            <label className="field">
              Bright-lesion sensitivity floor
              <input type="number" id="tune-bright" defaultValue="10" step="0.5" min="1" max="40" />
            </label>
            <div className="field-note">Calibrated for cotton wool spots and hard exudates across both open retina and perimacular background.</div>
            <label className="field">
              Minimum contrast above noise (k)
              <input type="number" id="tune-contrast" defaultValue="3" step="0.1" min="0.5" max="10" />
            </label>
            <div className="field-note">How far a candidate region must stand clear of local retinal noise.</div>
            <label className="field">
              Shape strictness (saturation ratio)
              <input type="number" id="tune-growth" defaultValue="1.10" step="0.01" min="1" max="2" />
            </label>
            <div className="field-note">How completely a region must be bounded before counting as a lesion. Tightening removes vessel crossing artifacts.</div>
            <div className="actions">
              <button id="rerun-detection" type="button">Re-run detection</button>
            </div>
          </div>

          {/* Grad-CAM Tuning */}
          <div className="tune-box" style={{ margin: 0 }}>
            <h3 style={{ marginTop: 0 }}>Step 3a: Grad-CAM attention regions</h3>
            <p className="small">Controls how finely the neural network attention heatmap is segmented into discrete attention hotspots.</p>
            <label className="field">
              Attention threshold (fraction of peak)
              <input type="number" id="tune-cam-threshold" defaultValue="0.5" step="0.05" min="0.15" max="0.95" />
            </label>
            <div className="field-note">Lower marks more, smaller regions. Higher retains only dominant peaks.</div>
            <label className="field">
              Maximum regions marked
              <input type="number" id="tune-cam-limit" defaultValue="12" step="1" min="1" max="40" />
            </label>
            <div className="field-note">Cap on discrete attention circles drawn on the overlay.</div>
            <div className="actions">
              <button id="rerun-cam" type="button">Re-draw regions</button>
            </div>
          </div>
        </div>

        {/* 2. Lesion Typing Decision Rules */}
        <h3 style={{ marginTop: '2rem' }}>How each lesion type is decided</h3>
        <table className="kv" id="lesion-rules">
          <tbody>
            <tr><td>Microaneurysm candidate</td><td>Small, round, isolated dark structure. Separated from blot hemorrhages by area (&le; 0.00018 of retinal area) and circular compactness.</td></tr>
            <tr><td>Dot/blot hemorrhage candidate</td><td>Dark region with larger area, compact shape, bounded response across structuring rungs.</td></tr>
            <tr><td>Hard exudate candidate</td><td>Bright structure with sharp margins, characterized by high mean edge gradient (&ge; 1.5&times; mean retinal gradient).</td></tr>
            <tr><td>Cotton wool spot candidate</td><td>Bright structure with soft, low-gradient borders, localized along nerve fiber layers and perimacular papillomacular bundle. Minimum area calibrated to 0.00008 (~50 px).</td></tr>
            <tr><td>Right Eye (OD) vs Left Eye (OS)</td><td>The optic disc is nasal to the fovea in either eye. When the disc is left of the fovea, the frame is a Right Eye (OD); when right of the fovea, it is a Left Eye (OS). Quadrant boundaries pass through the disc-fovea midline, ensuring balanced quadrant areas.</td></tr>
            <tr><td>Perimacular tolerance</td><td>The retina darkens naturally near the fovea. Contrast thresholds for soft bright lesions (cotton wool spots) scale adaptively in the perimacular annulus (2.5&times; macula radius) to prevent false suppression.</td></tr>
            <tr><td>Growth stops at vessels</td><td>Regions may not cross vessels. Vessel pixels are masked out from extent growth while lesion seeds touching vessels are protected from deletion.</td></tr>
            <tr><td>Saturation ladder test</td><td>Evaluates multi-scale directional closing at 1&times;, 2&times;, and 4&times; structuring element lengths. True bounded lesions saturate; open vessels and bifurcations keep expanding and are suppressed.</td></tr>
            <tr><td>Peripapillary suppression</td><td>Disc tissue and scleral crescents are excluded via dual-threshold region growing and blue-fraction colour analysis (lipid exudate reads yellow, disc tissue reads white/grey).</td></tr>
          </tbody>
        </table>

        {/* 3. Deep Learning Explainability & Landmark Mechanics */}
        <h3 style={{ marginTop: '2rem' }}>Explainability &amp; Anatomical Landmark Mechanics</h3>
        <p className="small">
          <strong>Grad-CAM Formulation:</strong> Computed from real gradients of the loaded classifier's output with respect to convolutional layer (<span id="cam-layer-name">conv_pw_11_relu</span>, 14&times;14 resolution). Always computed for the &quot;DR present&quot; class score to show evidence the model evaluated for pathology even on normal predictions. Marked regions represent gradient connected components above <span id="blob-threshold-text">50%</span> of peak activation.
        </p>
        <p className="small">
          <strong>Landmark Estimation (Step 3b):</strong> The optic disc is detected using a dual-score metric combining blurred luminance with local standard deviation, identifying the vascular trunk and textured rim. The fovea is located by morphologically removing vessels, applying masked background subtraction to find the darkest avascular depression, and anchoring the candidate relative to the disc.
        </p>
        <p className="small">
          <strong>Quality Gate (Step 1):</strong> Focus, brightness, and field-of-view are evaluated directly from pixel arrays using Laplacian variance (high-pass energy), greyscale histogram percentiles, and circular FOV mask ratio.
        </p>

        {/* 4. Structural Limits & Future ML Roadmap */}
        <h3 style={{ marginTop: '2rem' }}>Method Limitations &amp; Machine Learning Roadmap</h3>
        <p className="small">
          <strong>Structural Limits:</strong> Classical morphological detectors cannot reliably segment flame-shaped hemorrhages (which resemble vessels), venous beading, or fine neovascular fronds (proliferative signs), because linear directional filters deliberately remove elongated structures.
        </p>
        <p className="small">
          <strong>Segmentation Roadmap:</strong> A trained deep learning segmentation model (such as <a href="https://huggingface.co/ClementP/fundus-lesions-segmentation-unet_seresnext50_32x4d" target="_blank" rel="noopener noreferrer">ClementP/fundus-lesions-segmentation-unet_seresnext50_32x4d</a> on Hugging Face, trained on DDR, IDRiD, and MESSIDOR) represents the natural evolution to complement classical morphology with pixel-level deep segmentation masks.
        </p>
      </section>
    </>
  )
}
