CREATE TABLE IF NOT EXISTS clients (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  email               TEXT NOT NULL UNIQUE,
  name                TEXT,
  business_name       TEXT,
  stage               TEXT NOT NULL DEFAULT 'INQUIRY',
  intake_data         TEXT,
  questionnaire_data  TEXT,
  stripe_intent       TEXT,
  notes               TEXT,
  delivered_at        TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS client_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id   INTEGER NOT NULL REFERENCES clients(id),
  event_type  TEXT NOT NULL,
  data        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS staged_actions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id    INTEGER NOT NULL REFERENCES clients(id),
  action_type  TEXT NOT NULL,
  draft_body   TEXT NOT NULL,
  to_email     TEXT,
  subject      TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  approved_at  TEXT,
  executed_at  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
