import { createClient } from "@libsql/client";

let _db: ReturnType<typeof createClient> | null = null;

export function getDb() {
  if (!_db) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url) {
      throw new Error("TURSO_DATABASE_URL is not set");
    }

    _db = createClient({
      url,
      authToken: authToken || undefined,
    });
  }
  return _db;
}

export async function initDB() {
  const db = getDb();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS addresses (
      id TEXT PRIMARY KEY,
      local_part TEXT NOT NULL,
      domain TEXT NOT NULL DEFAULT 'rythamo.qzz.io',
      created_at TEXT DEFAULT (datetime('now')),
      is_active INTEGER DEFAULT 1,
      UNIQUE(local_part, domain)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      address TEXT NOT NULL,
      from_addr TEXT,
      subject TEXT DEFAULT '(no subject)',
      body TEXT DEFAULT '',
      html TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      is_read INTEGER DEFAULT 0
    )
  `);

  // Migration: add is_read column if missing
  try {
    await db.execute(`ALTER TABLE emails ADD COLUMN is_read INTEGER DEFAULT 0`);
  } catch {
    // Column already exists
  }

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_address ON emails(address)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_expires ON emails(expires_at)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_addresses_local ON addresses(local_part)
  `);
}

export async function cleanupExpired() {
  const db = getDb();
  await db.execute(`DELETE FROM emails WHERE expires_at < datetime('now')`);
}
