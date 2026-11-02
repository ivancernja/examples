import { api, APIError } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import log from "encore.dev/log";
import { db } from "./db";
import { runOnce, chat as agentChat, usingMock, MODEL, type RunResult } from "./agent";

/** Runs one check, with a Postgres advisory lock so a cron tick and a manual trigger never overlap. */
async function guardedRun(trigger: string, input?: string): Promise<RunResult> {
  const tx = await db.begin();
  try {
    const got = await tx.queryRow<{ ok: boolean }>`SELECT pg_try_advisory_xact_lock(4242) AS ok`;
    if (!got?.ok) return { outcome: "busy", modelCalls: 0, cost: 0, ms: 0, text: "another run is in progress" };
    const r = await runOnce(input);
    await db.exec`INSERT INTO runs (trigger, outcome, model_calls, cost, ms, summary)
      VALUES (${trigger}, ${r.outcome}, ${r.modelCalls}, ${r.cost}, ${r.ms}, ${r.text.slice(0, 500)})`;
    log.info(`run (${trigger}): ${r.outcome}, ${(r.ms / 1000).toFixed(1)}s, ${r.modelCalls} model calls, $${r.cost.toFixed(4)}`);
    return r;
  } catch (e) {
    log.error(e, `run (${trigger}) failed`); // the next tick tries again
    throw e;
  } finally {
    await tx.rollback(); // releases the lock
  }
}

/** Called by the cron job. Private: not reachable from the internet. */
export const tick = api({ expose: false, method: "POST", path: "/watcher/tick" }, async (): Promise<RunResult> => guardedRun("cron"));

// The always-on loop. Encore Cloud (or your own AWS/GCP) calls `tick` every 15 minutes.
// Cron jobs don't fire under `encore run`; use POST /watcher/run locally.
export const _watch = new CronJob("hn-watch", { title: "Check Hacker News", every: "15m", endpoint: tick });

interface RunRequest { /** Optional input, e.g. to test the approval flow. */ input?: string }
export const run = api({ expose: true, method: "POST", path: "/watcher/run" },
  async ({ input }: RunRequest): Promise<RunResult> => guardedRun("api", input));

interface ChatRequest { message: string }
interface ChatResponse { reply: string; modelCalls: number; cost: number }
export const chat = api({ expose: true, method: "POST", path: "/watcher/chat" },
  async ({ message }: ChatRequest): Promise<ChatResponse> => agentChat(message));

interface Pending { callId: string; name: string; arguments: unknown; createdAt: string }
export const pending = api({ expose: true, method: "GET", path: "/watcher/pending" }, async (): Promise<{ pending: Pending[] }> => {
  const out: Pending[] = [];
  for await (const r of db.query<{ call_id: string; name: string; arguments: string; created_at: Date }>`
    SELECT call_id, name, arguments, created_at FROM pending_calls ORDER BY created_at`)
    out.push({ callId: r.call_id, name: r.name, arguments: JSON.parse(r.arguments), createdAt: r.created_at.toISOString() });
  return { pending: out };
});

// In production, put auth in front of this (Encore auth handler) before exposing it.
interface DecideRequest { approve?: string[]; reject?: string[] }
export const decide = api({ expose: true, method: "POST", path: "/watcher/decisions" },
  async ({ approve = [], reject = [] }: DecideRequest): Promise<{ recorded: number }> => {
    for (const id of [...approve, ...reject]) {
      if (!(await db.queryRow`SELECT 1 AS x FROM pending_calls WHERE call_id = ${id}`)) throw APIError.notFound(`no pending call ${id}`);
    }
    for (const id of approve) await db.exec`INSERT INTO decisions VALUES (${id}, true) ON CONFLICT (call_id) DO UPDATE SET approve = true`;
    for (const id of reject) await db.exec`INSERT INTO decisions VALUES (${id}, false) ON CONFLICT (call_id) DO UPDATE SET approve = false`;
    return { recorded: approve.length + reject.length };
  });

interface Digest { id: number; markdown: string; createdAt: string }
export const digests = api({ expose: true, method: "GET", path: "/watcher/digests" }, async (): Promise<{ digests: Digest[] }> => {
  const out: Digest[] = [];
  for await (const r of db.query<{ id: number; markdown: string; created_at: Date }>`SELECT id, markdown, created_at FROM digests ORDER BY id DESC LIMIT 20`)
    out.push({ id: Number(r.id), markdown: r.markdown, createdAt: r.created_at.toISOString() });
  return { digests: out };
});

interface Status { model: string; mock: boolean; seen: number; runs: { trigger: string; outcome: string; modelCalls: number; cost: number; ms: number; summary: string; createdAt: string }[] }
export const status = api({ expose: true, method: "GET", path: "/watcher/status" }, async (): Promise<Status> => {
  const seen = Number((await db.queryRow<{ n: number }>`SELECT count(*)::int AS n FROM seen_stories`)!.n);
  const runs: Status["runs"] = [];
  for await (const r of db.query<any>`SELECT * FROM runs ORDER BY id DESC LIMIT 10`)
    runs.push({ trigger: r.trigger, outcome: r.outcome, modelCalls: r.model_calls, cost: r.cost, ms: r.ms, summary: r.summary, createdAt: r.created_at.toISOString() });
  return { model: MODEL, mock: usingMock(), seen, runs };
});
