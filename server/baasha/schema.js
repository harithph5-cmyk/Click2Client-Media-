// Tables for Baasha AI accounts, workspaces, memory and task ownership.
// This is deliberately separate from the site's main migration (server/store/db.js): if anything here fails, only
// Baasha accounts are affected and the rest of the website keeps working. Every statement is idempotent and uses
// only constructs the main migration already runs in production (IF NOT EXISTS, row level security).
export const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS baasha_users (
    id TEXT PRIMARY KEY, google_sub TEXT UNIQUE NOT NULL, email TEXT NOT NULL, name TEXT,
    created_at TEXT NOT NULL, last_login_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS baasha_workspaces (
    id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL)`,
  // One workspace per user in this stage. Members and roles come with team workspaces.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_baasha_ws_owner ON baasha_workspaces(owner_user_id)`,
  `CREATE TABLE IF NOT EXISTS baasha_sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, csrf TEXT NOT NULL,
    created_at TEXT NOT NULL, expires_at TEXT NOT NULL, ip_hash TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_baasha_sessions_user ON baasha_sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS baasha_memories (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, kind TEXT NOT NULL, subject TEXT, content TEXT NOT NULL,
    status TEXT NOT NULL, source TEXT NOT NULL, task_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_baasha_mem_ws ON baasha_memories(workspace_id, status)`,
  `CREATE TABLE IF NOT EXISTS baasha_memory_history (
    memory_id TEXT NOT NULL, version INTEGER NOT NULL, content TEXT NOT NULL, subject TEXT,
    changed_at TEXT NOT NULL, changed_by TEXT NOT NULL, reason TEXT, PRIMARY KEY (memory_id, version))`,
  `ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS workspace_id TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_agent_tasks_ws ON agent_tasks(workspace_id, created_at)`,
  // Server-only tables: row level security with no policy means the Supabase public API can read or write nothing here.
  `ALTER TABLE baasha_users ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE baasha_workspaces ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE baasha_sessions ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE baasha_memories ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE baasha_memory_history ENABLE ROW LEVEL SECURITY`,
];

const LOCK = 7_301_102_401;                       // advisory lock id (the main migration uses ...400)
const done = new WeakMap();

// Runs once per process and database handle. A failure is remembered as "unavailable" and retried on the next call.
export function ensureSchema(db) {
  if (!done.has(db)) {
    const p = db.tx(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock($1)', [LOCK]);
      for (const s of STATEMENTS) await c.query(s);
    }).catch((e) => { done.delete(db); throw e; });
    done.set(db, p);
  }
  return done.get(db);
}
