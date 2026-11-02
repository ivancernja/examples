import { secret } from "encore.dev/config";
import log from "encore.dev/log";
import { db } from "./db";
import { generate } from "./model";

const paperclipAPIKey = secret("PaperclipAPIKey");
const paperclipAPIURL = secret("PaperclipAPIURL");

function apiKey(): string {
  try {
    const k = paperclipAPIKey();
    if (k) return k;
  } catch {}
  return process.env.PAPERCLIP_API_KEY ?? "";
}

function apiURL(): string {
  let u = "";
  try {
    u = paperclipAPIURL() ?? "";
  } catch {}
  return (u || process.env.PAPERCLIP_API_URL || "").replace(/\/$/, "");
}

export function callbackConfigured(): boolean {
  return Boolean(apiURL() && apiKey());
}

async function paperclip(path: string, runId: string, init?: RequestInit): Promise<Response> {
  return fetch(`${apiURL()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
      "X-Paperclip-Run-Id": runId,
    },
  });
}

interface RunRow {
  id: string;
  agent_id: string;
  task_id: string | null;
  task_title: string | null;
}

// Paperclip treats a heartbeat run as finished when the webhook returns, and only
// accepts issue updates from a live run. So the run is processed inside the request.
export async function processRun(runId: string): Promise<void> {
  const run = await db.queryRow<RunRow>`
    UPDATE runs SET status = 'running', updated_at = now()
    WHERE id = ${runId} AND status IN ('queued', 'running')
    RETURNING id, agent_id, task_id, task_title`;
  if (!run) return;

  try {
    let task = run.task_title ?? "";
    if (callbackConfigured() && run.task_id) {
      // Claim the issue for this run. A 409 means another run owns it: never retry.
      const claim = await paperclip(`/api/issues/${run.task_id}/checkout`, run.id, {
        method: "POST",
        body: JSON.stringify({
          agentId: run.agent_id,
          expectedStatuses: ["todo", "backlog", "blocked", "in_progress"],
        }),
      });
      if (!claim.ok) log.warn("checkout failed", { status: claim.status });
      if (claim.status === 409) {
        await db.exec`UPDATE runs SET status = 'skipped', error = 'issue owned by another run', updated_at = now() WHERE id = ${run.id}`;
        return;
      }
      const res = await paperclip(`/api/issues/${run.task_id}`, run.id);
      if (res.ok) {
        const issue = (await res.json()) as { title?: string; description?: string };
        task = [issue.title, issue.description].filter(Boolean).join("\n\n");
      }
    }
    if (!task) task = "Add a todo list service";

    const out = await generate(task);
    let posted = false;
    if (callbackConfigured() && run.task_id) {
      // Closing the issue with the result stops Paperclip from waking us again.
      const res = await paperclip(`/api/issues/${run.task_id}`, run.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "done", comment: out.text }),
      });
      posted = res.ok;
      if (!res.ok) log.warn("issue update failed", { status: res.status, body: (await res.text()).slice(0, 300) });
    }
    await db.exec`
      UPDATE runs SET status = 'done', model = ${out.model}, output = ${out.text},
        posted_back = ${posted}, updated_at = now()
      WHERE id = ${run.id}`;
  } catch (err) {
    await db.exec`
      UPDATE runs SET status = 'failed', error = ${String(err)}, updated_at = now()
      WHERE id = ${run.id}`;
  }
}
