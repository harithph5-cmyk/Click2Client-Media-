-- Amounts are integer paise. Timestamps are UTC ISO-8601 strings.
CREATE TABLE IF NOT EXISTS workshops (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  event_date TEXT NOT NULL,             -- YYYY-MM-DD, shown in Asia/Kolkata
  duration_minutes INTEGER NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  original_amount_paise INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'OPEN',
  organizer TEXT NOT NULL,
  contact_number TEXT NOT NULL,         -- 10-digit Indian mobile, also the WhatsApp number
  certificate_info TEXT NOT NULL,
  offer_expiry TEXT,                    -- optional, admin-configured, display only
  capacity INTEGER,                     -- optional; NULL = no seat limit claimed
  qr_storage_key TEXT,                  -- private file, served only through a valid payment session
  recipient_name TEXT,                  -- verified payee name shown beside the QR
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_registration_id TEXT NOT NULL UNIQUE,
  workshop_id INTEGER NOT NULL REFERENCES workshops(id),
  full_name TEXT NOT NULL,
  normalized_phone TEXT NOT NULL,
  email TEXT NOT NULL,
  organization_name TEXT NOT NULL,
  professional_category TEXT NOT NULL,
  city TEXT NOT NULL,
  website_url TEXT,
  learning_goal TEXT,
  privacy_consent_at TEXT NOT NULL,
  amount_due_paise INTEGER NOT NULL,    -- fee frozen at creation
  currency TEXT NOT NULL DEFAULT 'INR',
  registration_status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT'
    CHECK (registration_status IN ('PENDING_PAYMENT','VERIFICATION_PENDING','PAID','REJECTED','EXPIRED','CANCELLED')),
  confirmed_at TEXT,
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- One live registration per phone per workshop; failed ones may re-register.
CREATE UNIQUE INDEX IF NOT EXISTS ux_reg_live_phone ON registrations(workshop_id, normalized_phone)
  WHERE registration_status IN ('PENDING_PAYMENT','VERIFICATION_PENDING','PAID');
CREATE INDEX IF NOT EXISTS ix_reg_status ON registrations(registration_status, created_at);

CREATE TABLE IF NOT EXISTS payment_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id INTEGER NOT NULL REFERENCES registrations(id),
  token_hash TEXT NOT NULL UNIQUE,      -- sha256 of the token; the token itself is never stored
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS payment_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id INTEGER NOT NULL REFERENCES registrations(id),
  transaction_reference TEXT NOT NULL,  -- upper-cased
  payment_date TEXT NOT NULL,
  screenshot_storage_key TEXT,
  verification_status TEXT NOT NULL DEFAULT 'SUBMITTED'
    CHECK (verification_status IN ('SUBMITTED','VERIFIED','REJECTED','CORRECTION_REQUESTED')),
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  verified_at TEXT,
  verified_by_admin_id INTEGER,
  rejection_reason TEXT
);
-- A UTR can be credited to only one registration; one open submission per registration.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sub_verified_ref ON payment_submissions(transaction_reference) WHERE verification_status = 'VERIFIED';
CREATE UNIQUE INDEX IF NOT EXISTS ux_sub_open ON payment_submissions(registration_id) WHERE verification_status = 'SUBMITTED';
CREATE INDEX IF NOT EXISTS ix_sub_ref ON payment_submissions(transaction_reference);

CREATE TABLE IF NOT EXISTS administrators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,          -- scrypt$salt$hash
  role TEXT NOT NULL DEFAULT 'ADMIN',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES administrators(id),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT NOT NULL,             -- ADMIN | PARTICIPANT | SYSTEM
  actor_id TEXT,
  action TEXT NOT NULL,
  registration_id INTEGER,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS ix_audit_reg ON audit_logs(registration_id);

INSERT OR IGNORE INTO workshops (id,title,description,event_date,duration_minutes,amount_paise,original_amount_paise,organizer,contact_number,certificate_info)
VALUES (1,'Master Meta Ads — Live Online 3-Hour Workshop',
 'Learn how to create campaigns, reach the right audience, generate qualified leads, and scale your business using Meta Ads.',
 '2026-11-01',180,49900,129900,'TerraNext Global Ventures','9940411837','Certificate of Participation Will Be Provided');
