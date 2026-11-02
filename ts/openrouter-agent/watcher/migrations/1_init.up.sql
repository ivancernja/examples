-- seen.json: story IDs from finished runs (long-term memory)
CREATE TABLE seen_stories (id TEXT PRIMARY KEY, seen_at TIMESTAMPTZ NOT NULL DEFAULT now());
-- fetched.json: story IDs returned during the current run
CREATE TABLE fetched_stories (id TEXT PRIMARY KEY);
-- state.json: the SDK's saved conversation as JSON text (one in flight at a time)
CREATE TABLE agent_state (id TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
-- digest.md
CREATE TABLE digests (id BIGSERIAL PRIMARY KEY, markdown TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
-- pending.log
CREATE TABLE pending_calls (call_id TEXT PRIMARY KEY, name TEXT NOT NULL, arguments TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
-- decisions.json
CREATE TABLE decisions (call_id TEXT PRIMARY KEY, approve BOOLEAN NOT NULL);
-- one row per run, so cost per check is easy to read
CREATE TABLE runs (id BIGSERIAL PRIMARY KEY, trigger TEXT NOT NULL, outcome TEXT NOT NULL, model_calls INT NOT NULL DEFAULT 0,
  cost DOUBLE PRECISION NOT NULL DEFAULT 0, ms INT NOT NULL, summary TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now());
