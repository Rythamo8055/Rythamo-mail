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
      expiry_minutes INTEGER DEFAULT 10,
      auto_delete INTEGER DEFAULT 1,
      max_emails INTEGER DEFAULT 100,
      UNIQUE(local_part, domain)
    )
  `);

  const migrations = [
    { sql: `ALTER TABLE addresses ADD COLUMN expiry_minutes INTEGER DEFAULT 10`, error: "duplicate column" },
    { sql: `ALTER TABLE addresses ADD COLUMN auto_delete INTEGER DEFAULT 1`, error: "duplicate column" },
    { sql: `ALTER TABLE addresses ADD COLUMN max_emails INTEGER DEFAULT 100`, error: "duplicate column" },
    { sql: `ALTER TABLE emails ADD COLUMN is_read INTEGER DEFAULT 0`, error: "duplicate column" },
    { sql: `ALTER TABLE addresses ADD COLUMN forward_to TEXT DEFAULT ''`, error: "duplicate column" },
  ];

  for (const migration of migrations) {
    try {
      await db.execute(migration.sql);
    } catch {
      // Column already exists
    }
  }

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
  await db.execute(`DELETE FROM emails WHERE expires_at < datetime('now') AND expires_at != 'never'`);
}

export const EXPIRY_OPTIONS = [
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 240, label: "4 hours" },
  { value: 1440, label: "24 hours" },
  { value: 10080, label: "7 days" },
  { value: 0, label: "Never" },
] as const;
