require('dotenv').config();
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('verbatim');
}
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let isConnected = false;
let realPool = null;

// In-memory fallback stores for local testing without database
const mockUsers = new Map();
const mockPatients = new Map();
const mockScreenings = new Map();
const mockRoles = [
  { role: 'patient', description: 'Patient accessing individual reports and health records' },
  { role: 'operator', description: 'Field health worker or screening operator uploading fundus imagery' },
  { role: 'doctor', description: 'Ophthalmologist or medical specialist assessing gradings and diagnoses' },
  { role: 'admin', description: 'System administrator managing users, roles, and clinics' }
];

// Pre-seed default mock users for testing
try {
  const usersFilePath = path.join(__dirname, 'data', 'users.json');
  if (fs.existsSync(usersFilePath)) {
    const raw = fs.readFileSync(usersFilePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      parsed.forEach(u => mockUsers.set(u.id || u.email, u));
    }
  }
} catch (e) {
  console.warn('Notice loading local users.json:', e.message);
}

if (process.env.DATABASE_URL) {
  try {
    realPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });

    realPool.on('error', (err) => {
      console.warn('[Supabase DB Pool] Connection notice:', err.code || err.message);
    });
  } catch (err) {
    console.warn('[DB] Could not initialize PostgreSQL pool:', err.message);
  }
}

async function initDb(maxRetries = 3) {
  if (!process.env.DATABASE_URL || !realPool) {
    console.log('[Dev Mode] No DATABASE_URL specified. Running with mock in-memory database.');
    isConnected = false;
    return;
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let client;
    try {
      client = await realPool.connect();
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

        ALTER TABLE patients ADD COLUMN IF NOT EXISTS severity_level VARCHAR(50) DEFAULT 'LOW';
        ALTER TABLE patients ADD COLUMN IF NOT EXISTS review_status VARCHAR(50) DEFAULT 'pending';
        ALTER TABLE patients ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;
        ALTER TABLE patients ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
        ALTER TABLE patients ADD COLUMN IF NOT EXISTS doctor_notes TEXT;
        ALTER TABLE patients ADD COLUMN IF NOT EXISTS doctor_grade VARCHAR(255);

        ALTER TABLE uploaded_screenings ADD COLUMN IF NOT EXISTS patient_id VARCHAR(255);
        ALTER TABLE uploaded_screenings ADD COLUMN IF NOT EXISTS patient_name VARCHAR(255);
        ALTER TABLE uploaded_screenings ADD COLUMN IF NOT EXISTS patient_phone VARCHAR(50);
        ALTER TABLE uploaded_screenings ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES users(id) ON DELETE SET NULL;
        ALTER TABLE uploaded_screenings ADD COLUMN IF NOT EXISTS eye VARCHAR(50);
        ALTER TABLE uploaded_screenings ADD COLUMN IF NOT EXISTS severity_level VARCHAR(50) DEFAULT 'LOW';
        ALTER TABLE uploaded_screenings ADD COLUMN IF NOT EXISTS review_status VARCHAR(50) DEFAULT 'pending';
        ALTER TABLE uploaded_screenings ADD COLUMN IF NOT EXISTS dr_softmax FLOAT;
        ALTER TABLE uploaded_screenings ADD COLUMN IF NOT EXISTS doctor_notes TEXT;
        ALTER TABLE uploaded_screenings ADD COLUMN IF NOT EXISTS doctor_grade VARCHAR(255);
      `);

      console.log('Database tables verified/created in Supabase Postgres.');
      client.release();
      isConnected = true;
      return;
    } catch (err) {
      if (client) client.release();
      console.warn(`[Supabase DB init] Attempt ${attempt}/${maxRetries} (${err.code || err.message})...`);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 800 * attempt));
      } else {
        console.warn('[Dev Mode] PostgreSQL connection failed. Enabling mock users & database store for local dev.');
        isConnected = false;
      }
    }
  }
}

// Resilient query function: uses real PostgreSQL if available; otherwise serves from mock stores
async function query(sql, params = []) {
  if (isConnected && realPool) {
    try {
      return await realPool.query(sql, params);
    } catch (err) {
      console.warn('[DB Query Notice] Falling back to mock store:', err.message);
    }
  }

  const s = sql.trim().toUpperCase();

  // 1. App roles
  if (s.includes('FROM APP_ROLES')) {
    return { rows: mockRoles };
  }

  // 2. Select user by email
  if (s.includes('FROM USERS') && s.includes('LOWER(EMAIL)')) {
    const email = (params[0] || '').toLowerCase();
    for (const u of mockUsers.values()) {
      if ((u.email || '').toLowerCase() === email) {
        return { rows: [u] };
      }
    }
    return { rows: [] };
  }

  // 3. Select user by ID
  if (s.includes('FROM USERS') && s.includes('WHERE ID')) {
    const id = params[0];
    const u = mockUsers.get(id);
    return { rows: u ? [u] : [] };
  }

  // 4. Insert user (Sign Up)
  if (s.startsWith('INSERT INTO USERS')) {
    const email = (params[0] || '').toLowerCase();
    const password_hash = params[1];
    const full_name = params[2] || 'User';
    const role = params[3] || 'operator';
    const phone = params[4] || null;
    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();

    const user = { id, email, password_hash, full_name, role, phone, created_at, last_login: created_at };
    mockUsers.set(id, user);
    mockUsers.set(email, user);

    return { rows: [user] };
  }

  // 5. Update last_login
  if (s.startsWith('UPDATE USERS SET LAST_LOGIN')) {
    const id = params[0];
    const u = mockUsers.get(id);
    if (u) u.last_login = new Date().toISOString();
    return { rows: [] };
  }

  // 6. Select patient by ID
  if (s.includes('FROM PATIENTS') && s.includes('LOWER(ID)')) {
    const pid = (params[0] || '').toLowerCase();
    for (const p of mockPatients.values()) {
      if ((p.id || '').toLowerCase() === pid) return { rows: [p] };
    }
    return { rows: [] };
  }

  // 7. Upsert patient
  if (s.startsWith('INSERT INTO PATIENTS')) {
    const id = params[0];
    const name = params[1];
    const phone = params[2] || null;
    const operator_id = params[3] || null;
    const patient = { id, name, phone, operator_id, created_at: new Date().toISOString() };
    mockPatients.set(id, patient);
    return { rows: [patient] };
  }

  // 8. Uploaded screenings
  if (s.startsWith('INSERT INTO UPLOADED_SCREENINGS')) {
    const item = {
      id: params[0] || crypto.randomUUID(),
      user_id: params[1],
      patient_id: params[2],
      patient_name: params[3],
      patient_phone: params[4],
      operator_id: params[5],
      eye: params[6],
      file_name: params[7],
      image_data: params[8],
      prediction: params[9],
      confidence: params[10],
      dr_score: params[11],
      icdr_grade: params[12],
      referable: params[13],
      quality_verdict: params[14],
      quality_reason: params[15],
      recommendations: params[16],
      lesion_counts: params[17],
      created_at: new Date().toISOString()
    };
    mockScreenings.set(item.id, item);
    return { rows: [item] };
  }

  if (s.includes('FROM UPLOADED_SCREENINGS')) {
    return { rows: Array.from(mockScreenings.values()) };
  }

  return { rows: [] };
}

module.exports = {
  pool: realPool || { query },
  query,
  initDb,
  mockUsers
};
