require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, initDb } = require('./db.cjs');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_dr_screening_2026';

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

// 1. Check if email exists
app.post('/api/auth/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const result = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [trimmedEmail]);

    return res.json({
      exists: result.rows.length > 0,
      email: trimmedEmail
    });
  } catch (err) {
    console.error('Check email error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Sign Up
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Check if already registered
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [trimmedEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
    }

    // Hash password with bcrypt
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert user
    const insertResult = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, last_login)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, email, full_name, created_at`,
      [trimmedEmail, passwordHash, fullName || null]
    );

    const newUser = insertResult.rows[0];

    // Create JWT Session Token (valid for 7 days)
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      message: 'Account created successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        fullName: newUser.full_name
      },
      token
    });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Failed to create account. Please try again.' });
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
    const result = await pool.query(
      'SELECT id, email, password_hash, full_name FROM users WHERE LOWER(email) = $1',
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
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    // Sign JWT
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name
      },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// 4. Current user session verification
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, full_name, created_at, last_login FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Auth verification error:', err);
    return res.status(500).json({ error: 'Verification failed' });
  }
});

// 5. Upload/sync screening and image to server (called when online or when network regains)
app.post('/api/screenings/upload', optionalAuthenticateToken, async (req, res) => {
  try {
    const {
      id,
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
    const createdAt = timestamp ? new Date(timestamp) : new Date();

    const query = `
      INSERT INTO uploaded_screenings (
        id, user_id, file_name, image_data, prediction, confidence, dr_score,
        icdr_grade, referable, quality_verdict, quality_reason, recommendations,
        lesion_counts, created_at, synced_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      ON CONFLICT (id) DO UPDATE SET
        synced_at = NOW(),
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
      RETURNING id, file_name, prediction, referable, created_at, synced_at;
    `;

    const values = [
      id,
      userId,
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

    const result = await pool.query(query, values);
    console.log(`[Server] Screening record ${id} (${fileName || 'Image'}) saved to PostgreSQL.`);

    return res.status(201).json({
      success: true,
      message: 'Screening image and report successfully saved to server',
      screening: result.rows[0]
    });
  } catch (err) {
    console.error('Screening upload error:', err);
    return res.status(500).json({ error: 'Failed to save screening to server', details: err.message });
  }
});

// 6. List uploaded screenings
app.get('/api/screenings', optionalAuthenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, user_id, file_name, prediction, confidence, dr_score,
             icdr_grade, referable, quality_verdict, quality_reason,
             recommendations, lesion_counts, created_at, synced_at
      FROM uploaded_screenings
      ORDER BY created_at DESC
      LIMIT 100
    `);
    return res.json({ screenings: result.rows });
  } catch (err) {
    console.error('Fetch screenings error:', err);
    return res.status(500).json({ error: 'Failed to retrieve screenings' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'DR Screening Auth API' });
});

app.listen(PORT, () => {
  console.log(`Auth server running on http://127.0.0.1:${PORT}`);
});
