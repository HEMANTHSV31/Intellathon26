require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, query, initDb } = require('./db.cjs');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_dr_screening_2026';

const { checkMatlabAvailability, detectLesions } = require('./matlabBridge.cjs');
const { runBackendScreening } = require('./screeningEngine.cjs');

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize DB schema
initDb();

// Middleware: Authenticate JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Middleware: Optional JWT (Allows anonymous/offline field uploads or associates with user)
function optionalAuthenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    req.user = err ? null : user;
    next();
  });
}

// 0. Get available app roles
app.get('/api/auth/roles', async (req, res) => {
  try {
    const result = await query('SELECT role, description FROM app_roles ORDER BY role ASC');
    return res.json({ roles: result.rows });
  } catch (err) {
    console.error('Fetch roles error:', err);
    return res.json({
      roles: [
        { role: 'patient', description: 'Patient accessing personal reports and health records' },
        { role: 'operator', description: 'Field health worker or clinic operator capturing fundus imagery' },
        { role: 'doctor', description: 'Ophthalmologist or medical specialist assessing diagnoses' },
        { role: 'admin', description: 'System administrator managing users, roles, and clinics' }
      ]
    });
  }
});

// 1. Check if email exists
app.post('/api/auth/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const result = await query('SELECT id, role FROM users WHERE LOWER(email) = $1', [trimmedEmail]);

    return res.json({
      exists: result.rows.length > 0,
      email: trimmedEmail,
      role: result.rows[0]?.role || null
    });
  } catch (err) {
    console.error('Check email error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Sign Up with Role and Phone
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, fullName, role, phone } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const assignedRole = ['patient', 'operator', 'doctor', 'admin'].includes(role) ? role : 'operator';

    // Check if already registered
    const existing = await query('SELECT id FROM users WHERE LOWER(email) = $1', [trimmedEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
    }

    // Hash password with bcrypt
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert user into Supabase with role
    const insertResult = await query(
      `INSERT INTO users (email, password_hash, full_name, role, phone, last_login)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, email, full_name, role, phone, created_at`,
      [trimmedEmail, passwordHash, fullName || null, assignedRole, phone || null]
    );

    const newUser = insertResult.rows[0];

    // Create JWT Session Token (valid for 7 days)
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role, fullName: newUser.full_name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      message: 'Account created successfully in Supabase',
      user: {
        id: newUser.id,
        email: newUser.email,
        fullName: newUser.full_name,
        role: newUser.role,
        phone: newUser.phone
      },
      token
    });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Failed to create account in Supabase: ' + (err.message || err) });
  }
});

// 3. Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Look up user
    const result = await query(
      'SELECT id, email, password_hash, full_name, role, phone FROM users WHERE LOWER(email) = $1',
      [trimmedEmail]
    );

    // If user email is NOT present in the DB, ask for sign up
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'This email is not registered yet. Please sign up first.',
        needsSignup: true,
        email: trimmedEmail
      });
    }

    const user = result.rows[0];

    // Compare bcrypt hash
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid password. Please check and try again.' });
    }

    // Update last_login
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const userRole = user.role || 'operator';

    // Sign JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: userRole, fullName: user.full_name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: userRole,
        phone: user.phone
      },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed: ' + (err.message || err) });
  }
});

// 3b. Patient Direct Login via single text field (Name + Phone digits)
app.post('/api/auth/patient-login', async (req, res) => {
  try {
    const rawInput = (req.body.query || req.body.identifier || '').trim().toLowerCase();
    if (!rawInput) {
      return res.status(400).json({ error: 'Please enter your patient name and phone number.' });
    }

    // Extract phone digits
    const phoneDigits = rawInput.replace(/\D/g, '');
    // Extract alphabetic characters
    const lettersOnly = rawInput.replace(/[^a-z]/g, '');

    // Potential patient ID derived from input
    const candidateId = phoneDigits ? `${lettersOnly}_${phoneDigits}` : lettersOnly;

    // Search patients table case-insensitively
    const patientQuery = `
      SELECT p.id, p.name, p.phone, p.created_at, p.updated_at
      FROM patients p
      WHERE LOWER(p.id) = $1
         OR LOWER(p.id) = $2
         OR (p.phone = $3 AND LOWER(REPLACE(p.name, ' ', '')) LIKE '%' || $4 || '%')
         OR (p.phone = $3 AND $4 LIKE '%' || LOWER(REPLACE(p.name, ' ', '')) || '%')
         OR (p.phone = $3)
         OR LOWER(p.id) LIKE '%' || $3 || '%'
      LIMIT 1;
    `;

    const result = await query(patientQuery, [
      rawInput,
      candidateId,
      phoneDigits || 'NOMATCH',
      lettersOnly || 'NOMATCH'
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'No patient screening records found in Supabase for this name and phone number. Please verify with your clinic operator.'
      });
    }

    const patient = result.rows[0];
    const patientId = patient.id.toLowerCase();

    // Sign patient session JWT
    const token = jwt.sign(
      {
        id: patient.id,
        patientId,
        fullName: patient.name,
        role: 'patient',
        phone: patient.phone
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      message: 'Patient record verified successfully',
      user: {
        id: patient.id,
        patientId,
        fullName: patient.name,
        email: `${patientId}@patient.portal`,
        role: 'patient',
        phone: patient.phone
      },
      token
    });
  } catch (err) {
    console.error('Patient login error:', err);
    return res.status(500).json({ error: 'Patient authentication failed: ' + (err.message || err) });
  }
});

// 4. Current user session verification
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    if (req.user?.role === 'patient') {
      const pResult = await query(
        'SELECT id, name, phone, created_at, updated_at FROM patients WHERE LOWER(id) = LOWER($1)',
        [req.user.patientId || req.user.id]
      );
      if (pResult.rows.length > 0) {
        const p = pResult.rows[0];
        return res.json({
          user: {
            id: p.id,
            patientId: p.id.toLowerCase(),
            fullName: p.name,
            email: `${p.id.toLowerCase()}@patient.portal`,
            role: 'patient',
            phone: p.phone,
            createdAt: p.created_at,
            updatedAt: p.updated_at
          }
        });
      }
    }

    const result = await query(
      'SELECT id, email, full_name, role, phone, created_at, last_login FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const row = result.rows[0];
    return res.json({
      user: {
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        role: row.role || 'operator',
        phone: row.phone,
        createdAt: row.created_at,
        lastLogin: row.last_login
      }
    });
  } catch (err) {
    console.error('Auth verification error:', err);
    return res.status(500).json({ error: 'Verification failed' });
  }
});

// 4b. Live System & Clinic Stats (Admin & Telemetry)
app.get('/api/stats', async (req, res) => {
  try {
    const pResult = await query('SELECT COUNT(*)::int as count FROM patients');
    const sResult = await query(`
      SELECT COUNT(*)::int as total,
             COUNT(CASE WHEN quality_verdict != 'reject' THEN 1 END)::int as passed,
             COUNT(CASE WHEN quality_verdict = 'reject' THEN 1 END)::int as rejected,
             COUNT(CASE WHEN referable = true THEN 1 END)::int as referable
      FROM uploaded_screenings
    `);
    const uResult = await query('SELECT COUNT(*)::int as count FROM users');

    return res.json({
      patientsCount: pResult.rows[0]?.count || 0,
      totalScreenings: sResult.rows[0]?.total || 0,
      passedQualityCount: sResult.rows[0]?.passed || 0,
      rejectedQualityCount: sResult.rows[0]?.rejected || 0,
      referableCount: sResult.rows[0]?.referable || 0,
      usersCount: uResult.rows[0]?.count || 0,
      databaseStatus: 'connected'
    });
  } catch (err) {
    console.error('Fetch stats error:', err);
    return res.status(500).json({ error: 'Failed to retrieve stats' });
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

// 5. Simulink & MATLAB Integration Endpoints

// Check if MATLAB is detected on the system
app.get('/api/simulink/status', (req, res) => {
  exec('where matlab', (err, stdout) => {
    const hasMatlab = !err && stdout && stdout.trim().length > 0;
    const simulinkDir = path.join(__dirname, '..', 'simulink');
    const filesExist = fs.existsSync(simulinkDir);

    res.json({
      matlabInstalled: !!hasMatlab,
      matlabPath: hasMatlab ? stdout.trim().split('\r\n')[0] : null,
      simulinkFilesReady: filesExist,
      simulinkDirectory: simulinkDir
    });
  });
});

// List available Simulink & MATLAB model files
app.get('/api/simulink/files', (req, res) => {
  try {
    const simulinkDir = path.join(__dirname, '..', 'simulink');
    if (!fs.existsSync(simulinkDir)) {
      return res.json({ files: [] });
    }
    const files = fs.readdirSync(simulinkDir).map(file => {
      const filePath = path.join(simulinkDir, file);
      const stat = fs.statSync(filePath);
      return {
        name: file,
        sizeBytes: stat.size,
        modified: stat.mtime
      };
    });
    return res.json({ files });
  } catch (err) {
    console.error('List simulink files error:', err);
    return res.status(500).json({ error: 'Failed to list Simulink files' });
  }
});

// Download a Simulink / MATLAB file
app.get('/api/simulink/download/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(__dirname, '..', 'simulink', filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.download(filePath, filename);
  } catch (err) {
    console.error('Download error:', err);
    return res.status(500).json({ error: 'File download failed' });
  }
});

// High-fidelity Simulink Mathematical Solver with Dynamic 365-Day Queuing
function solveSimulinkModel(params) {
  const p = {
    target: parseFloat(params.target) || 100000,
    perPatient: Math.max(1, parseFloat(params.perPatient) || 2),
    stations: parseFloat(params.stations) || 4,
    perStation: parseFloat(params.perStation) || 90,
    rejectPct: Math.min(90, Math.max(0, parseFloat(params.rejectPct) || 12)),
    bandwidth: parseFloat(params.bandwidth) || 10,
    imgSizeMB: Math.max(0.01, parseFloat(params.imgSizeMB) || 2.0),
    netHours: Math.min(24, Math.max(0.1, parseFloat(params.netHours) || 12)),
    modelRate: Math.max(0.01, parseFloat(params.modelRate) || 6.0),
    nodes: Math.max(1, parseFloat(params.nodes) || 1),
    referralPct: Math.min(100, Math.max(0, parseFloat(params.referralPct) || 18)),
    docs: parseFloat(params.docs) || 1,
    perDoc: parseFloat(params.perDoc) || 60,
    simDays: parseInt(params.simDays) || 365,
    stochasticVar: parseFloat(params.stochasticVar) || 0.12
  };

  const patientsPerDay = p.target / 365;
  const usableImages = patientsPerDay * p.perPatient;
  const rejectFrac = p.rejectPct / 100;
  const captureAttempts = usableImages / (1 - rejectFrac);
  const referrals = patientsPerDay * (p.referralPct / 100);

  const capAcq = p.stations * p.perStation;
  const demAcq = captureAttempts;
  const utilAcq = demAcq / capAcq;

  const capNet = (p.bandwidth * 3600 * p.netHours) / (p.imgSizeMB * 8);
  const demNet = usableImages;
  const utilNet = demNet / capNet;

  const capInf = p.modelRate * 1440 * p.nodes;
  const demInf = usableImages;
  const utilInf = demInf / capInf;

  const capReview = p.docs * p.perDoc;
  const demReview = referrals;
  const utilReview = capReview > 0 ? demReview / capReview : Infinity;

  const stages = [
    {
      key: 'acq',
      name: 'Image Acquisition',
      sub: 'Fundus Camera Stations',
      unit: 'images/day',
      demand: demAcq,
      capacity: capAcq,
      util: utilAcq,
      ceiling: (capAcq * (1 - rejectFrac) / p.perPatient) * 365,
      relief: 'Add a camera station or reduce image rejection rate to eliminate wasted captures'
    },
    {
      key: 'qc',
      name: 'Quality Gate',
      sub: 'On-device edge validation',
      unit: 'images/day',
      demand: captureAttempts,
      capacity: Infinity,
      util: 0,
      ceiling: Infinity,
      relief: 'Runs on capture station before upload; retakes loop back to acquisition'
    },
    {
      key: 'net',
      name: 'Network Transfer',
      sub: 'PHC uplink to inference server',
      unit: 'images/day',
      demand: demNet,
      capacity: capNet,
      util: utilNet,
      ceiling: (capNet / p.perPatient) * 365,
      relief: 'Increase uplink bandwidth, optimize image compression, or widen transfer window'
    },
    {
      key: 'inf',
      name: 'AI Inference',
      sub: 'MobileNet + Grad-CAM',
      unit: 'images/day',
      demand: demInf,
      capacity: capInf,
      util: utilInf,
      ceiling: (capInf / p.perPatient) * 365,
      relief: 'Spin up an additional GPU/CPU inference node (24/7 automated queue)'
    },
    {
      key: 'triage',
      name: 'Referral Triage',
      sub: 'Automated diagnostic split',
      unit: 'patients/day',
      demand: patientsPerDay,
      capacity: Infinity,
      util: 0,
      ceiling: Infinity,
      relief: 'Pure logic gate routing healthy patients to recall and abnormal scans to specialist'
    },
    {
      key: 'review',
      name: 'Specialist Review',
      sub: 'Ophthalmologist confirmation',
      unit: 'patients/day',
      demand: demReview,
      capacity: capReview,
      util: utilReview,
      ceiling: p.referralPct > 0 ? (capReview / (p.referralPct / 100)) * 365 : Infinity,
      relief: 'Hire more ophthalmologists or calibrate diagnostic threshold to reduce false-positive flags'
    }
  ];

  const binding = stages.filter(s => isFinite(s.capacity));
  let choke = binding[0];
  binding.forEach(s => {
    if (s.util > choke.util) choke = s;
  });

  const maxUtil = choke.util;
  const isOverCapacity = maxUtil > 1.0;
  const achievableTarget = isOverCapacity ? p.target / maxUtil : p.target;
  const shortfallPerDay = Math.max(0, patientsPerDay - achievableTarget / 365);
  const twelveMonthBacklog = shortfallPerDay * 365;

  // 365-Day Dynamic Queuing Simulation
  const days = p.simDays;
  const timeDays = [];
  const queueAcq = [];
  const queueNet = [];
  const queueInf = [];
  const queueReview = [];

  let qAcq = 0, qNet = 0, qInf = 0, qReview = 0;

  for (let d = 1; d <= days; d++) {
    timeDays.push(d);
    const seasonalFactor = 1 + 0.08 * Math.sin((2 * Math.PI * d) / 30);
    const dayDemandPatients = patientsPerDay * seasonalFactor;
    const dayUsableImages = dayDemandPatients * p.perPatient;
    const dayCaptureAttempts = dayUsableImages / (1 - rejectFrac);
    const dayReferrals = dayDemandPatients * (p.referralPct / 100);

    qAcq = Math.max(0, qAcq + (dayCaptureAttempts - capAcq));
    qNet = Math.max(0, qNet + (dayUsableImages - capNet));
    qInf = Math.max(0, qInf + (dayUsableImages - capInf));
    qReview = Math.max(0, qReview + (dayReferrals - capReview));

    queueAcq.push(Math.round(qAcq));
    queueNet.push(Math.round(qNet));
    queueInf.push(Math.round(qInf));
    queueReview.push(Math.round(qReview));
  }

  const order = binding.slice().sort((a, b) => b.util - a.util);

  return {
    params: p,
    stages,
    binding,
    choke,
    maxUtil,
    isOverCapacity,
    achievableTarget,
    shortfallPerDay,
    twelveMonthBacklog,
    patientsPerDay,
    usableImages,
    captureAttempts,
    referrals,
    order,
    dynamicQueues: {
      timeDays,
      acq: queueAcq,
      net: queueNet,
      inf: queueInf,
      review: queueReview
    }
  };
}

// Execute Simulink Simulation endpoint
app.post('/api/simulink/simulate', (req, res) => {
  try {
    const results = solveSimulinkModel(req.body || {});
    return res.json(results);
  } catch (err) {
    console.error('Simulink simulation error:', err);
    return res.status(500).json({ error: 'Failed to run simulation model' });
  }
});

// 5. MATLAB Lesion Detection Suite Endpoints
app.get('/api/matlab/status', (req, res) => {
  const status = checkMatlabAvailability();
  res.json({
    status: 'ok',
    matlab: status,
    codebase: {
      path: 'matlab/+dr/',
      cliScript: 'matlab/detectLesionsCli.m',
      pipeline: 'dr.detectLesionCandidates'
    }
  });
});

app.post('/api/matlab/detect-lesions', async (req, res) => {
  try {
    const { image, anatomy, options } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Fundus image is required for lesion detection' });
    }

    const results = await detectLesions(image, { anatomy, ...options });
    return res.json(results);
  } catch (err) {
    console.error('MATLAB lesion detection error:', err);
    return res.status(500).json({
      error: 'MATLAB lesion detection failed: ' + (err.message || err),
      engine: 'MATLAB Image Processing Suite'
    });
  }
});

// 6. Patient Intake Endpoint (Strictly Lowercases Patient Name + Phone Digits ID)
app.post('/api/patients/intake', optionalAuthenticateToken, async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Patient name and phone number are required.' });
    }

    // Force all patient identifiers to lowercase
    const cleanName = name.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const cleanPhone = phone.trim().replace(/\D/g, '');

    if (!cleanPhone) {
      return res.status(400).json({ error: 'Phone number must contain numeric digits.' });
    }

    const patientId = `${cleanName || 'patient'}_${cleanPhone}`.toLowerCase();
    const operatorId = req.user ? req.user.id : null;

    const upsertPatientQuery = `
      INSERT INTO patients (id, name, phone, operator_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        phone = EXCLUDED.phone,
        operator_id = COALESCE(EXCLUDED.operator_id, patients.operator_id),
        updated_at = NOW()
      RETURNING id, name, phone, operator_id, created_at, updated_at;
    `;

    const result = await query(upsertPatientQuery, [patientId, name.trim(), cleanPhone, operatorId]);

    return res.status(200).json({
      success: true,
      message: 'Patient record created/verified',
      patient: result.rows[0]
    });
  } catch (err) {
    console.error('Patient intake error:', err);
    return res.status(500).json({ error: 'Failed to record patient in Supabase: ' + (err.message || err) });
  }
});

// 7. Get Patients List (Doctor Priority Queue: High > Medium > Low)
app.get('/api/patients', optionalAuthenticateToken, async (req, res) => {
  try {
    const { status, severity } = req.query;
    let whereClauses = [];
    let params = [];

    // Filter by review status: pending (active priority queue), completed, or all
    if (status === 'completed') {
      whereClauses.push("LOWER(COALESCE(p.review_status, 'pending')) = 'completed'");
    } else if (status !== 'all') {
      // Default: active priority queue (not yet marked as complete)
      whereClauses.push("LOWER(COALESCE(p.review_status, 'pending')) != 'completed'");
    }

    if (severity && severity !== 'ALL') {
      params.push(severity.toUpperCase());
      whereClauses.push(`UPPER(COALESCE(p.severity_level, 'LOW')) = $${params.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const sql = `
      SELECT p.id, p.name, p.phone, p.created_at, p.updated_at,
             COALESCE(p.severity_level, 'LOW') as severity_level,
             COALESCE(p.review_status, 'pending') as review_status,
             p.reviewed_at,
             COUNT(s.id)::int as total_image_count,
             COUNT(CASE WHEN s.quality_verdict != 'reject' THEN 1 END)::int as quality_passed_count,
             COUNT(CASE WHEN s.quality_verdict = 'reject' THEN 1 END)::int as quality_rejected_count,
             MAX(s.created_at) as latest_screening_date,
             BOOL_OR(COALESCE(s.referable, false)) as referable_flag,
             MAX(s.dr_softmax) as max_dr_softmax,
             MAX(s.icdr_grade) as primary_icdr_grade
      FROM patients p
      LEFT JOIN uploaded_screenings s ON LOWER(p.id) = LOWER(s.patient_id)
      ${whereSql}
      GROUP BY p.id, p.name, p.phone, p.created_at, p.updated_at, p.severity_level, p.review_status, p.reviewed_at
      ORDER BY
        CASE
          WHEN UPPER(COALESCE(p.severity_level, 'LOW')) = 'HIGH' THEN 1
          WHEN UPPER(COALESCE(p.severity_level, 'LOW')) = 'MEDIUM' THEN 2
          WHEN UPPER(COALESCE(p.severity_level, 'LOW')) = 'LOW' THEN 3
          ELSE 4
        END ASC,
        p.updated_at DESC
      LIMIT 100
    `;

    const result = await query(sql, params);
    return res.json({ patients: result.rows });
  } catch (err) {
    console.error('Fetch patients error:', err);
    return res.status(500).json({ error: 'Failed to fetch patients list: ' + (err.message || err) });
  }
});

// 7b. Doctor: Mark Patient Review as Complete (removes from active priority queue)
app.post('/api/patients/:id/complete', optionalAuthenticateToken, async (req, res) => {
  try {
    const rawId = req.params.id;
    if (!rawId) {
      return res.status(400).json({ error: 'Patient ID is required' });
    }

    const patientId = rawId.trim().toLowerCase();
    const doctorUserId = req.user ? req.user.id : null;

    const patientUpdate = await query(
      `UPDATE patients
       SET review_status = 'completed',
           reviewed_by = $2,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE LOWER(id) = LOWER($1)
       RETURNING id, name, review_status, reviewed_at;`,
      [patientId, doctorUserId]
    );

    if (patientUpdate.rows.length === 0) {
      return res.status(404).json({ error: 'Patient record not found' });
    }

    await query(
      `UPDATE uploaded_screenings
       SET review_status = 'completed'
       WHERE LOWER(patient_id) = LOWER($1);`,
      [patientId]
    );

    console.log(`[Doctor Review] Patient ${patientId} marked as completed.`);
    return res.json({
      success: true,
      message: 'Patient review marked as complete and removed from active priority queue.',
      patient: patientUpdate.rows[0]
    });
  } catch (err) {
    console.error('Mark complete error:', err);
    return res.status(500).json({ error: 'Failed to complete review: ' + (err.message || err) });
  }
});

// 8. Upload fundus image & Run Automated Backend Screening
app.post('/api/screenings/upload', optionalAuthenticateToken, async (req, res) => {
  try {
    const {
      id,
      patientId,
      patientName,
      patientPhone,
      eye,
      fileName,
      imageData,
      prediction,
      confidence,
      drScore,
      icdrGrade,
      severityLevel: clientSeverity,
      referable,
      qualityVerdict,
      qualityReason,
      recommendations,
      lesionCounts,
      timestamp
    } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Screening ID is required' });
    }

    const userId = req.user ? req.user.id : null;
    const operatorId = req.user?.role === 'operator' ? req.user.id : (userId || null);
    const createdAt = timestamp ? new Date(timestamp) : new Date();

    // 1. Run Automated Backend Screening on the server
    let backendAnalysis = null;
    if (imageData) {
      try {
        backendAnalysis = await runBackendScreening(imageData, { eye, fileName });
      } catch (screenErr) {
        console.warn('Server screening engine exception:', screenErr.message);
      }
    }

    // Determine final screening values (backend analysis takes priority)
    const finalPrediction = backendAnalysis?.prediction || prediction || 'Screening Completed';
    const finalConfidence = backendAnalysis?.confidence ?? confidence ?? 0.95;
    const finalDrScore = backendAnalysis?.drScore ?? drScore ?? 0.5;
    const finalDrSoftmax = backendAnalysis?.drSoftmax ?? drScore ?? 0.5;
    const finalIcdrGrade = backendAnalysis?.icdrGrade || icdrGrade || 'ICDR Evaluated';
    const finalSeverity = backendAnalysis?.severityLevel || clientSeverity || (finalDrSoftmax >= 0.75 ? 'HIGH' : finalDrSoftmax >= 0.4 ? 'MEDIUM' : 'LOW');
    const finalReferable = backendAnalysis?.referable ?? !!referable;
    const finalQualityVerdict = backendAnalysis?.qualityVerdict || qualityVerdict || 'ok';
    const finalQualityReason = backendAnalysis?.qualityReason || qualityReason || null;
    const finalRecommendations = backendAnalysis?.recommendations || recommendations || [];
    const finalLesionCounts = backendAnalysis?.lesionCounts || lesionCounts || { microaneurysms: 0, hemorrhages: 0, hardExudates: 0, cottonWoolSpots: 0 };

    // 2. Normalize patient identifier to lowercase
    let finalPatientId = patientId ? patientId.toLowerCase() : null;
    if (patientName && patientPhone) {
      const cleanName = patientName.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const cleanPhone = patientPhone.trim().replace(/\D/g, '');
      finalPatientId = finalPatientId || `${cleanName || 'patient'}_${cleanPhone}`.toLowerCase();

      try {
        await query(`
          INSERT INTO patients (id, name, phone, operator_id, severity_level, review_status, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            phone = EXCLUDED.phone,
            severity_level = CASE
              WHEN UPPER(EXCLUDED.severity_level) = 'HIGH' OR UPPER(patients.severity_level) = 'HIGH' THEN 'HIGH'
              WHEN UPPER(EXCLUDED.severity_level) = 'MEDIUM' OR UPPER(patients.severity_level) = 'MEDIUM' THEN 'MEDIUM'
              ELSE 'LOW'
            END,
            review_status = 'pending',
            updated_at = NOW();
        `, [finalPatientId, patientName.trim(), cleanPhone, operatorId, finalSeverity]);
      } catch (pErr) {
        console.warn('Patient auto-sync notice:', pErr.message);
      }
    }

    // 3. Upsert screening record with severity level and dr_softmax
    const upsertScreeningQuery = `
      INSERT INTO uploaded_screenings (
        id, user_id, patient_id, patient_name, patient_phone, eye, operator_id,
        file_name, image_data, prediction, confidence, dr_score, dr_softmax,
        icdr_grade, severity_level, review_status, referable, quality_verdict, quality_reason,
        recommendations, lesion_counts, created_at, synced_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'pending', $16, $17, $18, $19, $20, $21, NOW())
      ON CONFLICT (id) DO UPDATE SET
        synced_at = NOW(),
        patient_id = COALESCE(EXCLUDED.patient_id, uploaded_screenings.patient_id),
        patient_name = COALESCE(EXCLUDED.patient_name, uploaded_screenings.patient_name),
        patient_phone = COALESCE(EXCLUDED.patient_phone, uploaded_screenings.patient_phone),
        eye = COALESCE(EXCLUDED.eye, uploaded_screenings.eye),
        operator_id = COALESCE(EXCLUDED.operator_id, uploaded_screenings.operator_id),
        image_data = COALESCE(EXCLUDED.image_data, uploaded_screenings.image_data),
        prediction = COALESCE(EXCLUDED.prediction, uploaded_screenings.prediction),
        confidence = COALESCE(EXCLUDED.confidence, uploaded_screenings.confidence),
        dr_score = COALESCE(EXCLUDED.dr_score, uploaded_screenings.dr_score),
        dr_softmax = COALESCE(EXCLUDED.dr_softmax, uploaded_screenings.dr_softmax),
        icdr_grade = COALESCE(EXCLUDED.icdr_grade, uploaded_screenings.icdr_grade),
        severity_level = COALESCE(EXCLUDED.severity_level, uploaded_screenings.severity_level),
        referable = COALESCE(EXCLUDED.referable, uploaded_screenings.referable),
        quality_verdict = COALESCE(EXCLUDED.quality_verdict, uploaded_screenings.quality_verdict),
        quality_reason = COALESCE(EXCLUDED.quality_reason, uploaded_screenings.quality_reason),
        recommendations = COALESCE(EXCLUDED.recommendations, uploaded_screenings.recommendations),
        lesion_counts = COALESCE(EXCLUDED.lesion_counts, uploaded_screenings.lesion_counts)
      RETURNING id, patient_id, patient_name, file_name, prediction, confidence, dr_softmax, icdr_grade, severity_level, referable, created_at;
    `;

    const values = [
      id,
      userId,
      finalPatientId,
      patientName || null,
      patientPhone || null,
      eye || null,
      operatorId,
      fileName || 'Fundus Image',
      imageData || null,
      finalPrediction,
      finalConfidence,
      finalDrScore,
      finalDrSoftmax,
      finalIcdrGrade,
      finalSeverity,
      finalReferable,
      finalQualityVerdict,
      finalQualityReason,
      JSON.stringify(finalRecommendations),
      JSON.stringify(finalLesionCounts),
      createdAt
    ];

    const result = await query(upsertScreeningQuery, values);
    console.log(`[Backend Screening] Analyzed ${id}: ${finalPrediction} (Softmax: ${finalDrSoftmax}, Severity: ${finalSeverity}). Saved to Supabase.`);

    return res.status(201).json({
      success: true,
      message: 'Screening processed by backend and saved to Supabase',
      screening: result.rows[0],
      analysis: {
        prediction: finalPrediction,
        drSoftmax: finalDrSoftmax,
        confidence: finalConfidence,
        icdrGrade: finalIcdrGrade,
        severityLevel: finalSeverity,
        referable: finalReferable,
        lesionCounts: finalLesionCounts
      }
    });
  } catch (err) {
    console.error('Screening upload error:', err);
    return res.status(500).json({ error: 'Failed to process screening in backend: ' + (err.message || err) });
  }
});

// 9. List uploaded screenings with lowercase filtering, severity, and image data
app.get('/api/screenings', optionalAuthenticateToken, async (req, res) => {
  try {
    const { patientId, severity, status } = req.query;
    let sql = `
      SELECT id, user_id, patient_id, patient_name, patient_phone, eye, operator_id,
             file_name, image_data, prediction, confidence, dr_score, dr_softmax,
             icdr_grade, severity_level, review_status, referable,
             quality_verdict, quality_reason, recommendations, lesion_counts,
             created_at, synced_at
      FROM uploaded_screenings
      WHERE 1=1
    `;
    const params = [];

    if (patientId) {
      params.push(patientId.trim().toLowerCase());
      sql += ` AND LOWER(patient_id) = LOWER($${params.length})`;
    }

    if (severity && severity !== 'ALL') {
      params.push(severity.toUpperCase());
      sql += ` AND UPPER(COALESCE(severity_level, 'LOW')) = $${params.length}`;
    }

    if (status && status !== 'ALL') {
      params.push(status.toLowerCase());
      sql += ` AND LOWER(COALESCE(review_status, 'pending')) = $${params.length}`;
    }

    sql += ` ORDER BY
      CASE
        WHEN UPPER(COALESCE(severity_level, 'LOW')) = 'HIGH' THEN 1
        WHEN UPPER(COALESCE(severity_level, 'LOW')) = 'MEDIUM' THEN 2
        WHEN UPPER(COALESCE(severity_level, 'LOW')) = 'LOW' THEN 3
        ELSE 4
      END ASC,
      created_at DESC
      LIMIT 100;
    `;

    const result = await query(sql, params);
    return res.json({ screenings: result.rows });
  } catch (err) {
    console.error('Fetch screenings error:', err);
    return res.status(500).json({ error: 'Failed to retrieve screenings' });
  }
});

// 10. Admin Records Search (Backend-based multi-field searching)
app.get('/api/admin/records', optionalAuthenticateToken, async (req, res) => {
  try {
    const { search, severity, status } = req.query;
    let sql = `
      SELECT s.id as screening_id, s.patient_id, s.patient_name, s.patient_phone, s.eye,
             s.file_name, s.image_data, s.prediction, s.confidence, s.dr_score, s.dr_softmax,
             s.icdr_grade, s.referable,
             COALESCE(s.severity_level, p.severity_level, 'LOW') as severity_level,
             COALESCE(p.review_status, s.review_status, 'pending') as review_status,
             s.quality_verdict, s.quality_reason, s.recommendations, s.lesion_counts,
             s.created_at, p.reviewed_at
      FROM uploaded_screenings s
      LEFT JOIN patients p ON LOWER(s.patient_id) = LOWER(p.id)
      WHERE 1=1
    `;
    const params = [];

    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      params.push(q);
      const idx = params.length;
      sql += ` AND (
        LOWER(COALESCE(s.patient_id, '')) LIKE $${idx} OR
        LOWER(COALESCE(s.patient_name, p.name, '')) LIKE $${idx} OR
        LOWER(COALESCE(s.patient_phone, p.phone, '')) LIKE $${idx} OR
        LOWER(COALESCE(s.file_name, '')) LIKE $${idx} OR
        LOWER(COALESCE(s.icdr_grade, '')) LIKE $${idx} OR
        LOWER(COALESCE(s.prediction, '')) LIKE $${idx}
      )`;
    }

    if (severity && severity !== 'ALL') {
      params.push(severity.toUpperCase());
      sql += ` AND UPPER(COALESCE(s.severity_level, p.severity_level, 'LOW')) = $${params.length}`;
    }

    if (status && status !== 'ALL') {
      params.push(status.toLowerCase());
      sql += ` AND LOWER(COALESCE(p.review_status, s.review_status, 'pending')) = $${params.length}`;
    }

    sql += ` ORDER BY
      CASE
        WHEN UPPER(COALESCE(s.severity_level, p.severity_level, 'LOW')) = 'HIGH' THEN 1
        WHEN UPPER(COALESCE(s.severity_level, p.severity_level, 'LOW')) = 'MEDIUM' THEN 2
        WHEN UPPER(COALESCE(s.severity_level, p.severity_level, 'LOW')) = 'LOW' THEN 3
        ELSE 4
      END ASC,
      s.created_at DESC
      LIMIT 150;
    `;

    const result = await query(sql, params);
    return res.json({
      records: result.rows,
      totalCount: result.rows.length,
      searchQuery: search || ''
    });
  } catch (err) {
    console.error('Admin search error:', err);
    return res.status(500).json({ error: 'Backend search failed: ' + (err.message || err) });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'DR Screening API with MATLAB/Simulink Integration' });
});

app.listen(PORT, () => {
  console.log(`Auth & Simulink server running on http://127.0.0.1:${PORT}`);
});
