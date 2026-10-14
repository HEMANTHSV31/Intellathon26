require('dotenv').config();
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('verbatim');
}
const { Pool } = require('pg');

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

async function query(text, params, maxRetries = 5) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      attempt++;
      const isTransient = err.code === 'EAI_AGAIN' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.message?.includes('EAI_AGAIN') || err.message?.includes('ECONNRESET');
      if (attempt >= maxRetries || !isTransient) {
        throw err;
      }
      console.warn(`[Supabase DB] Transient network error (${err.code || err.message}), retrying query attempt ${attempt}/${maxRetries}...`);
      await new Promise(r => setTimeout(r, 600 * attempt));
    }
  }
}

module.exports = {
  pool,
  query,
  initDb
};
