// A tiny stand-in for OpenRouter's Responses API, used only when the OpenRouterAPIKey secret is unset.
// It lets the real @openrouter/agent code path (tools, stop conditions, approval, state) run end to end
// without a key. It is not a model: it follows a fixed script.
import { api } from "encore.dev/api";
import { usingMock } from "./agent";

type Item = { type: string; name?: string; arguments?: string; call_id?: string; output?: unknown; role?: string; content?: unknown };

function plan(body: any): { call?: { name: string; args: object }; text?: string } {
  const items: Item[] = Array.isArray(body.input) ? body.input : [{ type: "message", role: "user", content: body.input }];
  const hasTools = Array.isArray(body.tools) && body.tools.length > 0;
  const calls = items.filter((i) => i.type === "function_call");
  const outputs = items.filter((i) => i.type === "function_call_output");
  const userText = items.filter((i) => i.role === "user").map((i) => (typeof i.content === "string" ? i.content : JSON.stringify(i.content))).join(" ");
  const toolNames = new Set((body.tools ?? []).map((t: any) => t.name));
  const lastCall = calls[calls.length - 1];
  const outputOf = (c?: Item) => {
    const o = outputs.find((x) => x.call_id === c?.call_id)?.output;
    try { return typeof o === "string" ? JSON.parse(o) : o; } catch { return o; }
  };

  if (!hasTools) return { text: "Stopped at the run's limits." };
  // Chat endpoint tools
  if (toolNames.has("search_hacker_news")) {
    if (!lastCall) return { call: { name: "search_hacker_news", args: { query: "AI agents" } } };
    const r = outputOf(lastCall);
    const list = Array.isArray(r) ? r.slice(0, 5).map((s: any) => `- ${s.title} (${s.points} points) ${s.url}`).join("\n") : "";
    return { text: list ? `[mock] Top results:\n${list}` : "[mock] Nothing matched." };
  }
  // Approval test: input asks for a heads-up
  if (/heads-up/i.test(userText) && !calls.some((c) => c.name === "post_to_team_channel"))
    return { call: { name: "post_to_team_channel", args: { message: "Heads-up (mock): a test post from the watcher." } } };
  if (lastCall?.name === "post_to_team_channel") return { text: "[mock] Handled the team channel post." };
  // Normal check: two searches, then a digest of whatever was new
  const searches = calls.filter((c) => c.name === "check_hacker_news");
  if (searches.length === 0) return { call: { name: "check_hacker_news", args: { query: "LLM" } } };
  if (searches.length === 1) return { call: { name: "check_hacker_news", args: { query: "AI agents" } } };
  if (lastCall?.name === "write_digest") return { text: "[mock] Wrote one digest entry." };
  const fresh = searches.flatMap((c) => { const r = outputOf(c); return Array.isArray(r) ? r : []; });
  if (!fresh.length) return { text: "[mock] Nothing new on Hacker News this run, so I wrote no digest entry." };
  const md = fresh.slice(0, 5).map((s: any) => `- **${s.title}** (${s.points} pts, ${s.comments} comments) ${s.url}`).join("\n");
  return { call: { name: "write_digest", args: { markdown: `## HN digest (mock model)\n\n${md}` } } };
}

let seq = 0;
export const responses = api.raw({ expose: true, method: "POST", path: "/mock-openrouter/api/v1/responses" }, async (req, res) => {
  if (!usingMock()) { res.writeHead(404); res.end(); return; } // disabled once a real key is set
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  const p = plan(body);
  const id = `mock_${Date.now()}_${++seq}`;
  const output = p.call
    ? [{ type: "function_call", id: `fc_${id}`, call_id: `call_${id}`, name: p.call.name, arguments: JSON.stringify(p.call.args), status: "completed" }]
    : [{ type: "message", id: `msg_${id}`, role: "assistant", status: "completed", content: [{ type: "output_text", text: p.text, annotations: [] }] }];
  const response = {
    id, object: "response", created_at: Math.floor(Date.now() / 1000), completed_at: Math.floor(Date.now() / 1000), model: body.model,
    status: "completed", output, output_text: p.text ?? "", error: null, incomplete_details: null, instructions: null, metadata: {},
    tools: [], tool_choice: "auto", parallel_tool_calls: true, temperature: null, top_p: null, frequency_penalty: null, presence_penalty: null,
    usage: { input_tokens: 0, input_tokens_details: { cached_tokens: 0 }, output_tokens: 0, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 0, cost: 0 },
  };
  res.writeHead(200, { "content-type": "text/event-stream" });
  res.write(`event: response.created\ndata: ${JSON.stringify({ type: "response.created", sequence_number: 0, response: { ...response, status: "in_progress", output: [] } })}\n\n`);
  res.write(`event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", sequence_number: 1, response })}\n\n`);
  res.end();
});
