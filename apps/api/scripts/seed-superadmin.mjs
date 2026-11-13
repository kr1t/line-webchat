// Creates the first super admin from SEED_SUPERADMIN_* env vars.
// Does nothing when a super admin already exists, so it is safe to run on every deploy.
import { hash } from '@node-rs/argon2';
import pg from 'pg';

const username = process.env.SEED_SUPERADMIN_USERNAME?.trim().toLowerCase();
const password = process.env.SEED_SUPERADMIN_PASSWORD;

if (!username || !password) {
  console.log('SEED_SUPERADMIN_* not set, skipping');
  process.exit(0);
}
if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
  console.error('SEED_SUPERADMIN_USERNAME must be 3-32 characters: a-z, 0-9, . _ -');
  process.exit(1);
}
if (password.length < 12) {
  console.error('SEED_SUPERADMIN_PASSWORD must be at least 12 characters');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const existing = await pool.query(`select 1 from admins where role = 'SUPER_ADMIN' limit 1`);
  if (existing.rowCount) {
    console.log('Super admin already exists, skipping');
  } else {
    const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    // The password comes from the operator, so no forced change; 2FA setup is still required on first login
    await pool.query(
      `insert into admins (username, display_name, role, password_hash, must_change_password)
       values ($1, $1, 'SUPER_ADMIN', $2, false)`,
      [username, passwordHash],
    );
    console.log(`Created super admin "${username}"`);
  }
} finally {
  await pool.end();
}
