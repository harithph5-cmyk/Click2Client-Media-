// CRM schema — additive and idempotent (CREATE/ALTER ... IF NOT EXISTS only).
// Existing tables (leads, orders, audits, settings, sessions …) are reused,
// never dropped or rewritten. Payments stay in `orders`; invoices carry their
// own paid_* columns so no payment is ever recorded twice.

const T = 'TIMESTAMPTZ NOT NULL DEFAULT NOW()';
const base = (name, cols) => `CREATE TABLE IF NOT EXISTS ${name} (id TEXT PRIMARY KEY, ${cols}, created_at ${T}, updated_at ${T})`;

export const CRM_SCHEMA = [
  // ── Team & access ──
  `CREATE TABLE IF NOT EXISTS roles (key TEXT PRIMARY KEY, name TEXT NOT NULL, permissions JSONB NOT NULL DEFAULT '[]', built_in BOOLEAN NOT NULL DEFAULT FALSE)`,
  base('users', `name TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'sales', password_hash TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, last_login TIMESTAMPTZ`),
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email))`,
  `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id TEXT`,
  `CREATE TABLE IF NOT EXISTS audit_logs (id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT NOW(), actor TEXT, actor_role TEXT, action TEXT NOT NULL, entity TEXT, entity_id TEXT, detail TEXT, ip TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_at ON audit_logs(at DESC)`,

  // ── Leads (existing table) — extra CRM columns ──
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to TEXT`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_followup DATE`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget TEXT`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS location TEXT`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS requirements TEXT`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_client_id TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status, created_at)`,

  // ── CRM ──
  base('companies', `name TEXT NOT NULL, website TEXT, industry TEXT, phone TEXT, email TEXT, location TEXT, notes TEXT`),
  base('contacts', `name TEXT NOT NULL, email TEXT, phone TEXT, company_id TEXT REFERENCES companies(id) ON DELETE SET NULL, position TEXT, lead_id TEXT, notes TEXT`),
  base('clients', `name TEXT NOT NULL, company_id TEXT REFERENCES companies(id) ON DELETE SET NULL, email TEXT, phone TEXT, website TEXT, services TEXT, status TEXT NOT NULL DEFAULT 'active', since DATE, lead_id TEXT, notes TEXT`),
  base('services', `name TEXT NOT NULL, price NUMERIC, active BOOLEAN NOT NULL DEFAULT TRUE`),
  base('deals', `name TEXT NOT NULL, client_id TEXT REFERENCES clients(id) ON DELETE SET NULL, lead_id TEXT, service TEXT, value NUMERIC NOT NULL DEFAULT 0, stage TEXT NOT NULL DEFAULT 'new', probability INTEGER NOT NULL DEFAULT 10, expected_close DATE, assigned_to TEXT, notes TEXT`),
  base('tasks', `title TEXT NOT NULL, description TEXT, assigned_to TEXT, due_date DATE, priority TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'pending', related TEXT`),
  base('activities', `type TEXT NOT NULL DEFAULT 'note', subject TEXT, body TEXT, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, actor TEXT`),
  `CREATE INDEX IF NOT EXISTS idx_activities_entity ON activities(entity_type, entity_id, created_at DESC)`,

  // ── Sales & finance ──
  base('invoices', `number TEXT NOT NULL UNIQUE, client_id TEXT REFERENCES clients(id) ON DELETE SET NULL, bill_to TEXT NOT NULL, bill_email TEXT, bill_address TEXT, gstin TEXT, issue_date DATE NOT NULL DEFAULT CURRENT_DATE, due_date DATE, subtotal NUMERIC NOT NULL DEFAULT 0, discount NUMERIC NOT NULL DEFAULT 0, gst_rate NUMERIC NOT NULL DEFAULT 18, tax NUMERIC NOT NULL DEFAULT 0, total NUMERIC NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'unpaid', paid_at DATE, paid_method TEXT, paid_ref TEXT, notes TEXT`),
  `CREATE TABLE IF NOT EXISTS invoice_items (id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE, description TEXT NOT NULL, qty NUMERIC NOT NULL DEFAULT 1, rate NUMERIC NOT NULL DEFAULT 0, amount NUMERIC NOT NULL DEFAULT 0)`,
  base('subscriptions', `client_id TEXT REFERENCES clients(id) ON DELETE SET NULL, plan TEXT NOT NULL, amount NUMERIC NOT NULL DEFAULT 0, cycle TEXT NOT NULL DEFAULT 'monthly', start_date DATE, next_renewal DATE, status TEXT NOT NULL DEFAULT 'active', notes TEXT`),
  base('expenses', `title TEXT NOT NULL, category TEXT, amount NUMERIC NOT NULL DEFAULT 0, spent_on DATE NOT NULL DEFAULT CURRENT_DATE, notes TEXT`),

  // ── Marketing & SEO ──
  base('seo_projects', `client_id TEXT REFERENCES clients(id) ON DELETE SET NULL, domain TEXT NOT NULL, name TEXT, status TEXT NOT NULL DEFAULT 'active', notes TEXT`),
  base('seo_keywords', `project_id TEXT REFERENCES seo_projects(id) ON DELETE CASCADE, keyword TEXT NOT NULL, target_url TEXT, position INTEGER, prev_position INTEGER, volume INTEGER, history JSONB NOT NULL DEFAULT '[]'`),
  base('backlinks', `project_id TEXT REFERENCES seo_projects(id) ON DELETE CASCADE, source_url TEXT NOT NULL, target_url TEXT, anchor TEXT, authority INTEGER, status TEXT NOT NULL DEFAULT 'live', found_on DATE`),
  // AEO (answer engines) and GEO (generative engines) manual visibility tracking
  base('visibility_checks', `track TEXT NOT NULL, project_id TEXT REFERENCES seo_projects(id) ON DELETE CASCADE, kind TEXT NOT NULL DEFAULT 'answer_visibility', platform TEXT, query TEXT NOT NULL, visible TEXT NOT NULL DEFAULT 'no', url TEXT, notes TEXT, checked_on DATE`),
  base('campaigns', `platform TEXT NOT NULL DEFAULT 'meta', name TEXT NOT NULL, client_id TEXT REFERENCES clients(id) ON DELETE SET NULL, budget NUMERIC NOT NULL DEFAULT 0, spent NUMERIC NOT NULL DEFAULT 0, leads INTEGER NOT NULL DEFAULT 0, conversions INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active', start_date DATE, end_date DATE, notes TEXT`),

  // ── Content ──
  base('content_calendar', `title TEXT NOT NULL, planned_on DATE NOT NULL, kind TEXT NOT NULL DEFAULT 'blog', status TEXT NOT NULL DEFAULT 'planned', writer TEXT, keyword TEXT, notes TEXT`),

  // ── Built-in roles (never overwritten once an admin edits them) ──
  `INSERT INTO roles (key, name, permissions, built_in) VALUES
    ('founder', 'Founder / Super Admin', '["*"]', TRUE),
    ('admin', 'Admin', '["dashboard","crm","payments","finance","seo","content","publish","reports","team","settings"]', TRUE),
    ('sales', 'Sales Executive', '["dashboard","crm","reports"]', TRUE),
    ('seo', 'SEO Executive', '["dashboard","seo","reports","crm"]', TRUE),
    ('writer', 'Content Writer', '["dashboard","content"]', TRUE),
    ('finance', 'Finance Manager', '["dashboard","payments","finance","reports"]', TRUE)
   ON CONFLICT (key) DO NOTHING`,
];
