-- NetControl schema

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'FM',
  ncs_callsign TEXT NOT NULL DEFAULT '',
  script TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrations for databases created before ncs_callsign was on templates
ALTER TABLE templates ADD COLUMN IF NOT EXISTS ncs_callsign TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS template_roll_call (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  callsign TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  city_state TEXT NOT NULL DEFAULT '',
  permanent BOOLEAN NOT NULL DEFAULT FALSE,
  position INT NOT NULL DEFAULT 0,
  UNIQUE (template_id, callsign)
);

CREATE INDEX IF NOT EXISTS idx_template_roll_call_template
  ON template_roll_call(template_id, position);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  template_id TEXT REFERENCES templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'FM',
  ncs_callsign TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_template_ended
  ON sessions(template_id, ended_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_sessions_name_ended
  ON sessions(name, ended_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS session_roll_call (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  callsign TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  city_state TEXT NOT NULL DEFAULT '',
  permanent BOOLEAN NOT NULL DEFAULT FALSE,
  responded BOOLEAN NOT NULL DEFAULT FALSE,
  -- consecutive completed nets this station missed before this session
  missed_streak INT NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0,
  UNIQUE (session_id, callsign)
);

CREATE INDEX IF NOT EXISTS idx_session_roll_call_session
  ON session_roll_call(session_id, position);

CREATE TABLE IF NOT EXISTS check_ins (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  sequence INT NOT NULL,
  callsign TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'checked-in',
  has_traffic BOOLEAN NOT NULL DEFAULT FALSE,
  traffic_notes TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, callsign)
);

CREATE INDEX IF NOT EXISTS idx_check_ins_session
  ON check_ins(session_id, sequence);

-- Local FCC ULS amateur callsign database (weekly complete dump)
CREATE TABLE IF NOT EXISTS callsigns (
  callsign TEXT PRIMARY KEY,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  entity_name TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  zip TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  license_id TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS callsign_db_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
