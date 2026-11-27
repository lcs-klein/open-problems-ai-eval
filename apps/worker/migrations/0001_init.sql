-- Open Problems in AI Evaluation — D1 (SQLite) Schema v1
-- Strictly separates public agenda tables from unredacted internal corpus tables.

PRAGMA foreign_keys = ON;

-- 1. Authentication & RBAC
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'moderator')),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  created_by TEXT,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  ip_hint TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- 2. Public Agenda Configuration & Static Audit Blobs
CREATE TABLE IF NOT EXISTS agenda_meta (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 3. Live Public Open Problems (with strict public vs internal column split)
CREATE TABLE IF NOT EXISTS open_problems (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('F', 'T', 'V', 'D', 'L', 'I', 'P')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  scores_json TEXT NOT NULL,
  paper_section_id TEXT NOT NULL DEFAULT '',
  manuscript_alignment TEXT NOT NULL DEFAULT 'aligned',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  lineage_json TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  governance_json TEXT NOT NULL,
  terminology_alerts_json TEXT NOT NULL DEFAULT '[]',
  public_extra_json TEXT NOT NULL DEFAULT '{}',
  internal_extra_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_open_problems_status_order ON open_problems(status, sort_order);
CREATE INDEX IF NOT EXISTS idx_open_problems_category ON open_problems(category);

-- 4. Live Specific Research Challenges (Tier 3)
CREATE TABLE IF NOT EXISTS specific_challenges (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  problem_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT,
  tractability TEXT,
  first_milestone TEXT,
  owners_json TEXT NOT NULL DEFAULT '[]',
  evidence_json TEXT NOT NULL DEFAULT '[]',
  extra_json TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_challenges_active_order ON specific_challenges(is_active, sort_order);

-- 5. Public Literature References
CREATE TABLE IF NOT EXISTS public_references (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT,
  type TEXT,
  table2 INTEGER NOT NULL DEFAULT 0,
  extraction_counts_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 6. Community Proposals (Pre-moderated: only 'approved' shown publicly)
CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  moderation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'deferred', 'spam')),
  proposal_type TEXT NOT NULL
    CHECK (proposal_type IN ('add', 'revise', 'merge', 'split', 'retire', 'challenge', 'challenge_update')),
  target_problem_ids_json TEXT NOT NULL DEFAULT '[]',
  category TEXT NOT NULL CHECK (category IN ('F', 'T', 'V', 'D', 'L', 'I', 'P')),
  proposed_title TEXT NOT NULL DEFAULT '',
  proposed_description TEXT NOT NULL DEFAULT '',
  what_changed TEXT NOT NULL DEFAULT '',
  why_changed TEXT NOT NULL,
  is_original_synthesis INTEGER NOT NULL DEFAULT 0,
  source_url TEXT NOT NULL DEFAULT '',
  source_verification TEXT NOT NULL DEFAULT '',
  used_ai_assistance INTEGER NOT NULL DEFAULT 0,
  ai_disclosure_details TEXT NOT NULL DEFAULT '',
  human_verification_steps TEXT NOT NULL DEFAULT '',
  coi_statement TEXT NOT NULL,
  proposer_name TEXT NOT NULL,
  challenge_milestone TEXT,
  challenge_owner TEXT,
  challenge_status TEXT,
  terminology_alerts_json TEXT NOT NULL DEFAULT '[]',
  submitter_ip_hash TEXT,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_by_name TEXT,
  reviewed_at TEXT,
  review_notes TEXT,
  decision_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_proposals_status_created ON proposals(moderation_status, created_at DESC);

-- 7. Community Peer Reviews (Pre-moderated: only 'approved' shown publicly)
CREATE TABLE IF NOT EXISTS peer_reviews (
  id TEXT PRIMARY KEY,
  moderation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'spam')),
  target_id TEXT NOT NULL,
  reviewer_name TEXT NOT NULL,
  stance TEXT NOT NULL CHECK (stance IN ('support', 'revise', 'object')),
  summary TEXT NOT NULL,
  submitter_ip_hash TEXT,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_by_name TEXT,
  reviewed_at TEXT,
  review_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_reviews_status_created ON peer_reviews(moderation_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_target ON peer_reviews(target_id);

-- 8. Human Moderator Collective Decisions
CREATE TABLE IF NOT EXISTS collective_decisions (
  id TEXT PRIMARY KEY,
  proposal_id TEXT REFERENCES proposals(id) ON DELETE SET NULL,
  target_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('moderator_approved', 'deferred', 'rejected')),
  moderator_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  moderator_name TEXT NOT NULL,
  rationale TEXT NOT NULL,
  minority_dissent TEXT,
  decided_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_decisions_decided ON collective_decisions(decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_target ON collective_decisions(target_id);

-- 9. Frozen Agenda Releases & Snapshots (for Academic Citation & Admin Rollback)
CREATE TABLE IF NOT EXISTS agenda_releases (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'consensus',
  summary TEXT NOT NULL DEFAULT '',
  problem_ids_json TEXT NOT NULL DEFAULT '[]',
  snapshot_json TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0,
  published_by TEXT,
  published_by_name TEXT,
  published_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_releases_published ON agenda_releases(published_at DESC);

-- 10. Immutable Editorial Audit Log
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);

-- 11. Lightweight D1 Rate Limiter
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

-- 12. Unredacted Internal Corpus Tables (STRICTLY /api/internal/* ONLY!)
CREATE TABLE IF NOT EXISTS internal_candidates (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS internal_originals (
  id TEXT PRIMARY KEY,
  legacy_id TEXT NOT NULL,
  title TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS internal_programme (
  id TEXT PRIMARY KEY,
  module TEXT,
  question TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_internal_programme_module ON internal_programme(module);

CREATE TABLE IF NOT EXISTS internal_literature (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  title TEXT,
  question_zh TEXT,
  payload_json TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_internal_literature_source ON internal_literature(source_id);

CREATE TABLE IF NOT EXISTS internal_experts (
  id TEXT PRIMARY KEY,
  expert TEXT NOT NULL,
  wording TEXT NOT NULL,
  wording_en TEXT,
  payload_json TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS internal_meta (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);
