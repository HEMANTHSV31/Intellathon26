require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, initDb } = require('./db.cjs');

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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'DR Screening Auth & MATLAB API' });
});

app.listen(PORT, () => {
  console.log(`Auth and MATLAB server running on http://127.0.0.1:${PORT}`);
});
