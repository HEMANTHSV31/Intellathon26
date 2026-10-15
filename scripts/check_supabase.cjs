const { pool } = require('../server/db.cjs');

async function check() {
  try {
    const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log("=== TABLES IN PUBLIC SCHEMA ===");
    console.log(tables.rows.map(r => r.table_name));

    console.log("\n=== PATIENTS ===");
    const p = await pool.query("SELECT * FROM patients ORDER BY updated_at DESC");
    console.log("Count:", p.rows.length);
    console.log(JSON.stringify(p.rows, null, 2));

    console.log("\n=== UPLOADED_SCREENINGS ===");
    const s = await pool.query("SELECT id, patient_id, patient_name, patient_phone, file_name, prediction, dr_softmax, severity_level, review_status, created_at, synced_at FROM uploaded_screenings ORDER BY created_at DESC LIMIT 20");
    console.log("Count:", s.rows.length);
    console.log(JSON.stringify(s.rows, null, 2));

    console.log("\n=== USERS ===");
    const u = await pool.query("SELECT id, email, full_name, role, created_at FROM users");
    console.log("Count:", u.rows.length);
    console.log(JSON.stringify(u.rows, null, 2));

  } catch (err) {
    console.error("Error checking DB:", err);
  } finally {
    await pool.end();
  }
}

check();
