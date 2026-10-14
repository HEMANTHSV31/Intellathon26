require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dbUrl = process.env.DATABASE_URL || '';
const hasPlaceholderPassword = dbUrl.includes('[YOUR-PASSWORD]') || !dbUrl;

let isPgConnected = false;
let pgPool = null;

if (!hasPlaceholderPassword) {
  try {
    pgPool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false }
    });
  } catch (e) {
    console.warn('Failed to initialize PostgreSQL pool:', e.message);
  }
}

// Local fallback JSON user store in server/data/users.json
const dataDir = path.join(__dirname, 'data');
const localDbPath = path.join(dataDir, 'users.json');

function ensureLocalDb() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(localDbPath)) {
    fs.writeFileSync(localDbPath, JSON.stringify([], null, 2));
  }
}

function readLocalUsers() {
  ensureLocalDb();
  try {
    const raw = fs.readFileSync(localDbPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeLocalUsers(users) {
  ensureLocalDb();
  fs.writeFileSync(localDbPath, JSON.stringify(users, null, 2));
}

// Fallback query emulator for local JSON storage
function executeLocalQuery(sql, params = []) {
  const users = readLocalUsers();
  const lowerSql = sql.toLowerCase();

  // 1. SELECT id FROM users WHERE LOWER(email) = $1
  if (lowerSql.includes('select id from users where lower(email) =')) {
    const targetEmail = (params[0] || '').toLowerCase();
    const match = users.find(u => (u.email || '').toLowerCase() === targetEmail);
    return { rows: match ? [{ id: match.id }] : [] };
  }

  // 2. SELECT id, email, password_hash, full_name FROM users WHERE LOWER(email) = $1
  if (lowerSql.includes('select id, email, password_hash, full_name from users where lower(email) =')) {
    const targetEmail = (params[0] || '').toLowerCase();
    const match = users.find(u => (u.email || '').toLowerCase() === targetEmail);
    return { rows: match ? [{ id: match.id, email: match.email, password_hash: match.password_hash, full_name: match.full_name }] : [] };
  }

  // 3. INSERT INTO users (email, password_hash, full_name, last_login) VALUES ... RETURNING id, email, full_name, created_at
  if (lowerSql.includes('insert into users')) {
    const newUser = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
      email: params[0],
      password_hash: params[1],
      full_name: params[2] || null,
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString()
    };
    users.push(newUser);
    writeLocalUsers(users);
    return {
      rows: [{
        id: newUser.id,
        email: newUser.email,
        full_name: newUser.full_name,
        created_at: newUser.created_at
      }]
    };
  }

  // 4. UPDATE users SET last_login = NOW() WHERE id = $1
  if (lowerSql.includes('update users set last_login')) {
    const userId = params[0];
    const u = users.find(x => x.id === userId);
    if (u) {
      u.last_login = new Date().toISOString();
      writeLocalUsers(users);
    }
    return { rows: [] };
  }

  // 5. SELECT id, email, full_name, created_at, last_login FROM users WHERE id = $1
  if (lowerSql.includes('from users where id =')) {
    const userId = params[0];
    const match = users.find(u => u.id === userId);
    return { rows: match ? [match] : [] };
  }

  return { rows: [] };
}

// Wrapper pool object matching pg Pool interface
const pool = {
  async query(sql, params) {
    if (isPgConnected && pgPool) {
      try {
        return await pgPool.query(sql, params);
      } catch (err) {
        console.warn('PostgreSQL query error, falling back to local user store:', err.message);
        return executeLocalQuery(sql, params);
      }
    }
    return executeLocalQuery(sql, params);
  }
};

async function initDb() {
  if (hasPlaceholderPassword || !pgPool) {
    console.log('PostgreSQL password is not configured yet in .env; using secure local persistent user store.');
    ensureLocalDb();
    return;
  }

  try {
    const client = await pgPool.connect();
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

    isPgConnected = true;
    console.log('Connected to Supabase Postgres. Users table verified.');
    client.release();
  } catch (err) {
    isPgConnected = false;
    console.warn('Supabase Postgres connection failed (' + err.message + '). Active local user fallback enabled.');
    ensureLocalDb();
  }
}

module.exports = {
  pool,
  initDb
};
