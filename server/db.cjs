require('dotenv').config();
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('verbatim');
}
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// Gracefully handle idle client errors (like transient cloud ECONNRESET) to prevent Node process termination
pool.on('error', (err) => {
  console.warn('[Supabase DB Pool] Idle client notice (recovering automatically):', err.code || err.message);
});

async function initDb(maxRetries = 5) {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('[YOUR-PASSWORD]')) {
    console.log('[DB Notice] Using local JSON storage fallback (Supabase credentials not configured in .env).');
    return;
  }
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let client;
    try {
      client = await pool.connect();
      console.log('Connected to Supabase PostgreSQL database.');

      // Create app_roles table and seed default roles
      await client.query(`
        CREATE TABLE IF NOT EXISTS app_roles (
          role VARCHAR(50) PRIMARY KEY,
          description TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        INSERT INTO app_roles (role, description) VALUES
          ('patient', 'Patient accessing individual reports and health records'),
          ('operator', 'Field health worker or screening operator uploading fundus imagery'),
          ('doctor', 'Ophthalmologist or medical specialist assessing gradings and diagnoses'),
          ('admin', 'System administrator managing users, roles, and clinics')
        ON CONFLICT (role) DO UPDATE SET description = EXCLUDED.description;
      `);

      // Create users table if it does not already exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          full_name VARCHAR(255),
          role VARCHAR(50) DEFAULT 'operator' REFERENCES app_roles(role),
          phone VARCHAR(50),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          last_login TIMESTAMPTZ
        );

        ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'operator';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
      `);

      // Create patients table
      await client.query(`
        CREATE TABLE IF NOT EXISTS patients (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          phone VARCHAR(50),
          operator_id UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // Create uploaded_screenings table
      await client.query(`
        CREATE TABLE IF NOT EXISTS uploaded_screenings (
          id VARCHAR(255) PRIMARY KEY,
          user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          patient_id VARCHAR(255),
          patient_name VARCHAR(255),
          patient_phone VARCHAR(50),
          operator_id UUID REFERENCES users(id) ON DELETE SET NULL,
          eye VARCHAR(50),
          file_name VARCHAR(255),
          image_data TEXT,
          prediction VARCHAR(255),
          confidence FLOAT,
          dr_score FLOAT,
          icdr_grade VARCHAR(255),
          referable BOOLEAN DEFAULT FALSE,
          quality_verdict VARCHAR(50),
          quality_reason TEXT,
          recommendations JSONB,
          lesion_counts JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          synced_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // Ensure patient columns exist if uploaded_screenings already pre-existed
      await client.query(`
        ALTER TABLE patients ADD COLUMN IF NOT EXISTS severity_level VARCHAR(50) DEFAULT 'LOW';
        ALTER TABLE patients ADD COLUMN IF NOT EXISTS review_status VARCHAR(50) DEFAULT 'pending';
        ALTER TABLE patients ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;
        ALTER TABLE patients ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

        ALTER TABLE uploaded_screenings ADD COLUMN IF NOT EXISTS patient_id VARCHAR(255);
        ALTER TABLE uploaded_screenings ADD COLUMN IF NOT EXISTS patient_name VARCHAR(255);
        ALTER TABLE uploaded_screenings ADD COLUMN IF NOT EXISTS patient_phone VARCHAR(50);
        ALTER TABLE uploaded_screenings ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES users(id) ON DELETE SET NULL;
        ALTER TABLE uploaded_screenings ADD COLUMN IF NOT EXISTS eye VARCHAR(50);
        ALTER TABLE uploaded_screenings ADD COLUMN IF NOT EXISTS severity_level VARCHAR(50) DEFAULT 'LOW';
        ALTER TABLE uploaded_screenings ADD COLUMN IF NOT EXISTS review_status VARCHAR(50) DEFAULT 'pending';
        ALTER TABLE uploaded_screenings ADD COLUMN IF NOT EXISTS dr_softmax FLOAT;
      `);

      console.log('Database tables (app_roles, users, patients, uploaded_screenings) verified/created in Supabase Postgres.');
      client.release();
      return;
    } catch (err) {
      if (client) client.release();
      console.warn(`[Supabase DB init] Attempt ${attempt}/${maxRetries} failed (${err.code || err.message})...`);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
      } else {
        console.error('Final database initialization error:', err);
      }
    }
  }
}

// Local JSON fallback storage for offline/unconfigured database mode
const dataDir = path.join(__dirname, 'data');
function readJson(file, fallback = []) {
  try {
    const p = path.join(dataDir, file);
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}
function writeJson(file, data) {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, file), JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to write local storage:', err);
  }
}

function executeLocalFallback(text, params = []) {
  const sql = text.toLowerCase();

  // Patients intake upsert
  if (sql.includes('insert into patients')) {
    const patients = readJson('patients.json');
    const id = params[0];
    const name = params[1];
    const phone = params[2];
    const operator_id = params[3] || null;
    let existing = patients.find(p => (p.id || '').toLowerCase() === (id || '').toLowerCase());
    if (existing) {
      existing.name = name;
      existing.phone = phone;
      existing.updated_at = new Date().toISOString();
    } else {
      existing = {
        id,
        name,
        phone,
        operator_id,
        severity_level: 'LOW',
        review_status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      patients.push(existing);
    }
    writeJson('patients.json', patients);
    return { rows: [existing] };
  }

  // Patients query
  if (sql.includes('from patients')) {
    const patients = readJson('patients.json');
    return { rows: patients };
  }

  // Screenings insert
  if (sql.includes('insert into uploaded_screenings')) {
    const screenings = readJson('screenings.json');
    const rec = {
      id: params[0],
      user_id: params[1] || null,
      patient_id: params[2] || null,
      patient_name: params[3] || null,
      patient_phone: params[4] || null,
      operator_id: params[5] || null,
      eye: params[6] || null,
      file_name: params[7] || null,
      image_data: params[8] || null,
      prediction: params[9] || null,
      confidence: params[10] || null,
      dr_score: params[11] || null,
      icdr_grade: params[12] || null,
      referable: !!params[13],
      quality_verdict: params[14] || null,
      quality_reason: params[15] || null,
      recommendations: params[16] || null,
      lesion_counts: params[17] || null,
      created_at: new Date().toISOString(),
      synced_at: new Date().toISOString()
    };
    const idx = screenings.findIndex(s => s.id === rec.id);
    if (idx >= 0) screenings[idx] = rec;
    else screenings.unshift(rec);
    writeJson('screenings.json', screenings);
    return { rows: [rec] };
  }

  // Screenings query
  if (sql.includes('from uploaded_screenings')) {
    const screenings = readJson('screenings.json');
    return { rows: screenings };
  }

  // Users query/insert
  if (sql.includes('users')) {
    const users = readJson('users.json');
    if (sql.includes('select id from users where lower(email) =')) {
      const match = users.find(u => (u.email || '').toLowerCase() === (params[0] || '').toLowerCase());
      return { rows: match ? [{ id: match.id }] : [] };
    }
    if (sql.includes('select id, email, password_hash, full_name from users where lower(email) =') || sql.includes('role from users where lower(email) =')) {
      const match = users.find(u => (u.email || '').toLowerCase() === (params[0] || '').toLowerCase());
      return { rows: match ? [match] : [] };
    }
    if (sql.includes('insert into users')) {
      const newUser = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        email: params[0],
        password_hash: params[1],
        full_name: params[2] || null,
        role: params[3] || 'operator',
        phone: params[4] || null,
        created_at: new Date().toISOString(),
        last_login: new Date().toISOString()
      };
      users.push(newUser);
      writeJson('users.json', users);
      return { rows: [newUser] };
    }
    return { rows: users };
  }

  if (sql.includes('count(*)')) {
    return { rows: [{ count: 0, total: 0, passed: 0, rejected: 0, referable: 0 }] };
  }

  return { rows: [] };
}

async function query(text, params, maxRetries = 5) {
  // If credentials are placeholder, use local store immediately
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('[YOUR-PASSWORD]')) {
    return executeLocalFallback(text, params);
  }

  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      if (err.code === '28P01' || err.message?.includes('password authentication failed')) {
        console.warn('[DB Notice] Supabase password authentication failed; saving operation to local secure storage.');
        return executeLocalFallback(text, params);
      }

      attempt++;
      const isTransient = err.code === 'EAI_AGAIN' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.message?.includes('EAI_AGAIN') || err.message?.includes('ECONNRESET');
      if (attempt >= maxRetries || !isTransient) {
        console.warn(`[DB Notice] Query failed (${err.code || err.message}), falling back to local storage.`);
        return executeLocalFallback(text, params);
      }
      console.warn(`[Supabase DB] Transient network error (${err.code || err.message}), retrying query attempt ${attempt}/${maxRetries}...`);
      await new Promise(r => setTimeout(r, 600 * attempt));
    }
  }
}

// Attach wrapper query to pool for any direct pool.query calls
const originalPoolQuery = pool.query.bind(pool);
pool.query = async function (text, params) {
  return query(text, params);
};

module.exports = {
  pool,
  query,
  initDb
};
