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

// 4. Current user session verification
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
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

// 6. Patient Intake Endpoint (Generates Patient Name + Phone Digits ID)
app.post('/api/patients/intake', optionalAuthenticateToken, async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Patient name and phone number are required.' });
    }

    const cleanName = name.trim().replace(/[^a-zA-Z0-9]/g, '');
    const cleanPhone = phone.trim().replace(/\D/g, '');

    if (!cleanPhone) {
      return res.status(400).json({ error: 'Phone number must contain at least some digits.' });
    }

    const patientId = `${cleanName || 'Patient'}_${cleanPhone}`;
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

// 7. Get Patients List
app.get('/api/patients', optionalAuthenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT p.id, p.name, p.phone, p.created_at, p.updated_at,
             COUNT(s.id)::int as image_count,
             MAX(s.created_at) as latest_screening_date,
             BOOL_OR(COALESCE(s.referable, false)) as referable_flag
      FROM patients p
      LEFT JOIN uploaded_screenings s ON p.id = s.patient_id
      GROUP BY p.id, p.name, p.phone, p.created_at, p.updated_at
      ORDER BY p.updated_at DESC
      LIMIT 100
    `);
    return res.json({ patients: result.rows });
  } catch (err) {
    console.error('Fetch patients error:', err);
    return res.status(500).json({ error: 'Failed to fetch patients list' });
  }
});

// 8. Upload/sync screening and image to Supabase
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

    // If patient metadata is provided, ensure patient record is in Supabase
    let finalPatientId = patientId || null;
    if (patientName && patientPhone) {
      const cleanName = patientName.trim().replace(/[^a-zA-Z0-9]/g, '');
      const cleanPhone = patientPhone.trim().replace(/\D/g, '');
      finalPatientId = finalPatientId || `${cleanName || 'Patient'}_${cleanPhone}`;

      try {
        await query(`
          INSERT INTO patients (id, name, phone, operator_id, created_at, updated_at)
          VALUES ($1, $2, $3, $4, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
        `, [finalPatientId, patientName.trim(), cleanPhone, operatorId]);
      } catch (pErr) {
        console.warn('Patient auto-sync notice:', pErr.message);
      }
    }

    const upsertScreeningQuery = `
      INSERT INTO uploaded_screenings (
        id, user_id, patient_id, patient_name, patient_phone, eye, operator_id,
        file_name, image_data, prediction, confidence, dr_score,
        icdr_grade, referable, quality_verdict, quality_reason, recommendations,
        lesion_counts, created_at, synced_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())
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
        icdr_grade = COALESCE(EXCLUDED.icdr_grade, uploaded_screenings.icdr_grade),
        referable = COALESCE(EXCLUDED.referable, uploaded_screenings.referable),
        quality_verdict = COALESCE(EXCLUDED.quality_verdict, uploaded_screenings.quality_verdict),
        quality_reason = COALESCE(EXCLUDED.quality_reason, uploaded_screenings.quality_reason),
        recommendations = COALESCE(EXCLUDED.recommendations, uploaded_screenings.recommendations),
        lesion_counts = COALESCE(EXCLUDED.lesion_counts, uploaded_screenings.lesion_counts)
      RETURNING id, patient_id, patient_name, file_name, prediction, referable, created_at, synced_at;
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
      prediction || 'Screening Completed',
      confidence !== undefined && confidence !== null ? confidence : null,
      drScore !== undefined && drScore !== null ? drScore : null,
      icdrGrade || null,
      !!referable,
      qualityVerdict || null,
      qualityReason || null,
      recommendations ? JSON.stringify(recommendations) : null,
      lesionCounts ? JSON.stringify(lesionCounts) : null,
      createdAt
    ];

    const result = await query(upsertScreeningQuery, values);
    console.log(`[Supabase] Screening record ${id} (Patient: ${finalPatientId || 'Anonymous'}) saved.`);

    return res.status(201).json({
      success: true,
      message: 'Screening image and report successfully saved to Supabase',
      screening: result.rows[0]
    });
  } catch (err) {
    console.error('Screening upload error:', err);
    return res.status(500).json({ error: 'Failed to save screening to Supabase', details: err.message });
  }
});

// 9. List uploaded screenings
app.get('/api/screenings', optionalAuthenticateToken, async (req, res) => {
  try {
    const { patientId } = req.query;
    let sql = `
      SELECT id, user_id, patient_id, patient_name, patient_phone, eye, operator_id,
             file_name, prediction, confidence, dr_score,
             icdr_grade, referable, quality_verdict, quality_reason,
             recommendations, lesion_counts, created_at, synced_at
      FROM uploaded_screenings
    `;
    const params = [];
    if (patientId) {
      sql += ' WHERE patient_id = $1';
      params.push(patientId);
    }
    sql += ' ORDER BY created_at DESC LIMIT 100';

    const result = await query(sql, params);
    return res.json({ screenings: result.rows });
  } catch (err) {
    console.error('Fetch screenings error:', err);
    return res.status(500).json({ error: 'Failed to retrieve screenings' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'DR Screening Auth & MATLAB API' });
});

app.listen(PORT, () => {
  console.log(`Auth and MATLAB server running on http://127.0.0.1:${PORT}`);
});
