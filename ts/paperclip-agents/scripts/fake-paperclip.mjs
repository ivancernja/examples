// Minimal stand-in for the Paperclip API, used to test the callback path offline.
import http from "node:http";

const port = Number(process.env.PORT ?? 3999);
const comments = [];

http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const auth = req.headers.authorization ?? "";
      const run = req.headers["x-paperclip-run-id"] ?? "";
      console.log(req.method, req.url, "auth:", auth.startsWith("Bearer ") ? "yes" : "no", "run:", run);
      res.setHeader("Content-Type", "application/json");
      if (/^\/api\/issues\/[^/]+\/checkout$/.test(req.url) && req.method === "POST") {
        return res.end(JSON.stringify({ status: "in_progress" }));
      }
      const m = req.url.match(/^\/api\/issues\/([^/]+)(\/comments)?$/);
      if (m && req.method === "GET" && !m[2]) {
        return res.end(JSON.stringify({ id: m[1], title: "Add a bookmarks service with tags", description: "Users save URLs with tags and list them by tag." }));
      }
      if (m && req.method === "PATCH" && !m[2]) {
        const b = JSON.parse(body);
        comments.push({ issueId: m[1], status: b.status, body: b.comment });
        return res.end(JSON.stringify({ id: m[1], status: b.status }));
      }
      if (m && req.method === "POST" && m[2]) {
        comments.push({ issueId: m[1], ...JSON.parse(body) });
        return res.end(JSON.stringify({ id: String(comments.length) }));
      }
      if (req.url === "/_comments") return res.end(JSON.stringify(comments));
      res.statusCode = 404;
      res.end("{}");
    });
  })
  .listen(port, () => console.log(`fake paperclip on :${port}`));
