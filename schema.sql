-- Schema für die D1-Datenbank von cuttingforce.app (Benutzerkonten + Sitzungen)
-- Anwenden mit: npx wrangler d1 execute cuttingforce-db --local --file=./schema.sql
--          bzw. npx wrangler d1 execute cuttingforce-db --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  iterations INTEGER NOT NULL DEFAULT 100000,
  created_at TEXT NOT NULL,
  last_login_at TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  -- 0 = wartet auf Freigabe durch den Administrator, 1 = freigegeben (kann sich anmelden).
  -- Das Konto mit der E-Mail aus ADMIN_EMAIL ist davon unabhängig immer zugelassen.
  approved INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
