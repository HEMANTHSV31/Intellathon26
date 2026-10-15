require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');

let isConnected = false;
let realPool = null;

// In-memory fallback user store for local development
const mockUsers = new Map();

if (process.env.DATABASE_URL) {
  try {
    realPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
  } catch (err) {
    console.warn('Could not initialize PostgreSQL pool:', err.message);
  }
}

async function initDb() {
  if (!process.env.DATABASE_URL) {
    console.log('[Dev Mode] No DATABASE_URL specified. Running with in-memory auth database.');
    return;
  }

  try {
    const client = await realPool.connect();
    console.log('Connecting to Supabase PostgreSQL database...');

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

    console.log('Users table verified/created in Supabase Postgres.');
    client.release();
    isConnected = true;
  } catch (err) {
    console.warn('[Dev Mode] PostgreSQL connection failed (' + err.message + '). Falling back to in-memory database for seamless local testing.');
    isConnected = false;
  }
}

// Resilient query interface: delegates to Postgres when connected, otherwise uses mock store
async function query(sql, params = []) {
  if (isConnected && realPool) {
    try {
      return await realPool.query(sql, params);
    } catch (err) {
      console.warn('Postgres query error, falling back to local memory store:', err.message);
    }
  }

  const normalized = sql.trim().toUpperCase();

  // 1. Check existing user by email
  if (normalized.includes('SELECT ID FROM USERS WHERE LOWER(EMAIL)')) {
    const targetEmail = (params[0] || '').toLowerCase();
    const rows = [];
    for (const u of mockUsers.values()) {
      if (u.email.toLowerCase() === targetEmail) {
        rows.push({ id: u.id });
      }
    }
    return { rows };
  }

  // 2. Select user by email for login
  if (normalized.includes('SELECT ID, EMAIL, PASSWORD_HASH, FULL_NAME FROM USERS WHERE LOWER(EMAIL)')) {
    const targetEmail = (params[0] || '').toLowerCase();
    const rows = [];
    for (const u of mockUsers.values()) {
      if (u.email.toLowerCase() === targetEmail) {
        rows.push({
          id: u.id,
          email: u.email,
          password_hash: u.password_hash,
          full_name: u.full_name
        });
      }
    }
    return { rows };
  }

  // 3. Insert user (Sign Up)
  if (normalized.startsWith('INSERT INTO USERS')) {
    const email = params[0];
    const password_hash = params[1];
    const full_name = params[2] || null;
    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();

    const newUser = {
      id,
      email,
      password_hash,
      full_name,
      created_at,
      last_login: created_at
    };
    mockUsers.set(id, newUser);

    return {
      rows: [{
        id: newUser.id,
        email: newUser.email,
        full_name: newUser.full_name,
        created_at: newUser.created_at
      }]
    };
  }

  // 4. Update last_login
  if (normalized.startsWith('UPDATE USERS SET LAST_LOGIN')) {
    const id = params[0];
    const u = mockUsers.get(id);
    if (u) {
      u.last_login = new Date().toISOString();
    }
    return { rows: [] };
  }

  // 5. Select user by id (/api/auth/me)
  if (normalized.includes('SELECT ID, EMAIL, FULL_NAME, CREATED_AT, LAST_LOGIN FROM USERS WHERE ID')) {
    const id = params[0];
    const u = mockUsers.get(id);
    return { rows: u ? [{ id: u.id, email: u.email, full_name: u.full_name, created_at: u.created_at, last_login: u.last_login }] : [] };
  }

  return { rows: [] };
}

module.exports = {
  pool: { query },
  initDb
};
