import { secret } from "encore.dev/config";

const openAIKey = secret("OpenAIKey");

export interface ModelResult {
  model: string;
  text: string;
}

function key(): string {
  try {
    const k = openAIKey();
    if (k) return k;
  } catch {}
  return process.env.OPENAI_API_KEY ?? "";
}

const SYSTEM = `You are an Encore.ts backend engineer working inside a Paperclip company.
Reply with a short plan and the TypeScript for one Encore.ts service that solves the task.
Use encore.dev/api for endpoints, encore.dev/storage/sqldb for Postgres, encore.dev/pubsub for async work and encore.dev/cron for schedules.
Keep it to one service folder: encore.service.ts, api.ts and a migration if needed.`;

export async function generate(task: string): Promise<ModelResult> {
  const k = key();
  if (!k) return { model: "mock", text: mock(task) };
  const model = process.env.AGENT_MODEL ?? "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${k}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: task },
      ],
    }),
  });
  if (!res.ok) throw new Error(`model call failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { choices: { message: { content: string } }[] };
  return { model, text: body.choices[0]?.message.content ?? "" };
}

function slug(task: string): string {
  const s = task.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
  return s || "service";
}

export function mock(task: string): string {
  const stop = new Set(["add", "a", "an", "the", "create", "build", "new", "make", "service", "api"]);
  const name = slug(task).split("-").find((w) => w.length > 2 && !stop.has(w)) ?? "items";
  return [
    `Plan: add an Encore.ts service \`${name}\` with a Postgres table and CRUD endpoints for: ${task}`,
    "",
    "```ts",
    `// ${name}/encore.service.ts`,
    `import { Service } from "encore.dev/service";`,
    `export default new Service("${name}");`,
    "",
    `// ${name}/api.ts`,
    `import { api } from "encore.dev/api";`,
    `import { SQLDatabase } from "encore.dev/storage/sqldb";`,
    `const db = new SQLDatabase("${name}", { migrations: "./migrations" });`,
    `export const create = api({ expose: true, method: "POST", path: "/${name}" },`,
    `  async (p: { title: string }): Promise<{ id: number }> => {`,
    `    const row = await db.queryRow<{ id: number }>\`INSERT INTO ${name} (title) VALUES (\${p.title}) RETURNING id\`;`,
    `    return { id: row!.id };`,
    `  });`,
    "```",
  ].join("\n");
}
