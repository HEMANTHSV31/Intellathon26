require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDb() {
  try {
    const client = await pool.connect();
    console.log('Connecting to Supabase PostgreSQL database...');

    // Create users table if it does not already exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_login TIMESTAMPTZ
      );
    `);

    // Create uploaded_screenings table for fundus images and screening results
    await client.query(`
      CREATE TABLE IF NOT EXISTS uploaded_screenings (
        id VARCHAR(255) PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        file_name VARCHAR(255),
        image_data TEXT,
        prediction VARCHAR(100),
        confidence NUMERIC,
        dr_score NUMERIC,
        icdr_grade VARCHAR(100),
        referable BOOLEAN DEFAULT false,
        quality_verdict VARCHAR(50),
        quality_reason TEXT,
        recommendations JSONB,
        lesion_counts JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        synced_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    console.log('Database tables verified/created in Supabase Postgres.');
    client.release();
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

module.exports = {
  pool,
  initDb
};
