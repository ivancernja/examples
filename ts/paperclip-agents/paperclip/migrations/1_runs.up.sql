CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  task_id TEXT,
  wake_reason TEXT,
  task_title TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  model TEXT,
  output TEXT,
  error TEXT,
  posted_back BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
