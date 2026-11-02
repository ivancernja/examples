import { api, APIError, Header } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { CronJob } from "encore.dev/cron";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { processRun, callbackConfigured } from "./runs";

const heartbeatToken = secret("HeartbeatToken");

function checkToken(auth?: string): void {
  let want = "";
  try {
    want = heartbeatToken() ?? "";
  } catch {}
  if (want && auth !== `Bearer ${want}`) throw APIError.unauthenticated("bad heartbeat token");
}

interface HeartbeatRequest {
  authorization?: Header<"Authorization">;
  runId?: string;
  agentId: string;
  companyId?: string;
  // Paperclip sends the full wake context; only a few string fields are read.
  context?: Record<string, any>;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

interface HeartbeatResponse {
  accepted: boolean;
  runId: string;
}

// Target for Paperclip's built-in "http" adapter. Paperclip POSTs here on every
// heartbeat and treats the run as finished when this request returns.
// If the HeartbeatToken secret is set, the adapter must send it as a bearer token
// (http adapter `headers` config).
export const heartbeat = api(
  { expose: true, method: "POST", path: "/paperclip/heartbeat" },
  async (req: HeartbeatRequest): Promise<HeartbeatResponse> => {
    checkToken(req.authorization);
    const runId = req.runId ?? randomUUID();
    const c = req.context ?? {};
    const taskId = str(c.taskId) ?? str(c.issueId);
    const companyId = req.companyId ?? str(c.companyId) ?? "unknown";
    await db.exec`
      INSERT INTO runs (id, agent_id, company_id, task_id, wake_reason, task_title)
      VALUES (${runId}, ${req.agentId}, ${companyId}, ${taskId},
              ${str(c.wakeReason)}, ${str(c.taskTitle)})
      ON CONFLICT (id) DO NOTHING`;
    await processRun(runId);
    return { accepted: true, runId };
  },
);

interface Run {
  id: string;
  agentId: string;
  companyId: string;
  taskId: string | null;
  status: string;
  model: string | null;
  output: string | null;
  error: string | null;
  postedBack: boolean;
  createdAt: string;
}

interface RunDbRow {
  id: string;
  agent_id: string;
  company_id: string;
  task_id: string | null;
  status: string;
  model: string | null;
  output: string | null;
  error: string | null;
  posted_back: boolean;
  created_at: Date;
}

function toRun(r: RunDbRow): Run {
  return {
    id: r.id,
    agentId: r.agent_id,
    companyId: r.company_id,
    taskId: r.task_id,
    status: r.status,
    model: r.model,
    output: r.output,
    error: r.error,
    postedBack: r.posted_back,
    createdAt: r.created_at.toISOString(),
  };
}

export const listRuns = api(
  { expose: true, method: "GET", path: "/paperclip/runs" },
  async (): Promise<{ runs: Run[] }> => {
    const runs: Run[] = [];
    for await (const r of db.query<RunDbRow>`SELECT * FROM runs ORDER BY created_at DESC LIMIT 50`) {
      runs.push(toRun(r));
    }
    return { runs };
  },
);

export const getRun = api(
  { expose: true, method: "GET", path: "/paperclip/runs/:id" },
  async ({ id }: { id: string }): Promise<Run> => {
    const r = await db.queryRow<RunDbRow>`SELECT * FROM runs WHERE id = ${id}`;
    if (!r) throw APIError.notFound("run not found");
    return toRun(r);
  },
);

interface Health {
  ok: boolean;
  callback: boolean;
}

export const health = api(
  { expose: true, method: "GET", path: "/health" },
  async (): Promise<Health> => ({ ok: true, callback: callbackConfigured() }),
);

// Marks runs that never finished (for example after a crash) as failed.
export const sweepStale = api({}, async (): Promise<void> => {
  await db.exec`
    UPDATE runs SET status = 'failed', error = 'timed out', updated_at = now()
    WHERE status IN ('queued', 'running') AND updated_at < now() - interval '30 minutes'`;
});

new CronJob("sweep-stale-runs", { title: "Fail stuck runs", every: "1h", endpoint: sweepStale });

// Paperclip's http adapter probes the URL with HEAD when it verifies the agent.
export const heartbeatProbe = api.raw(
  { expose: true, method: "HEAD", path: "/paperclip/heartbeat" },
  async (_req, res) => {
    res.statusCode = 204;
    res.end();
  },
);
