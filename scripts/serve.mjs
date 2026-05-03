import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.QA_PORT || 4000);
const ROOT = path.resolve("reports");

fs.mkdirSync(ROOT, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

function listRuns() {
  const files = fs.readdirSync(ROOT).filter((f) => f.startsWith("qa-report-"));
  const runs = {};
  for (const f of files) {
    const stamp = f.replace(/^qa-report-/, "").replace(/\.(json|md)$/, "");
    if (!runs[stamp]) runs[stamp] = { stamp };
    if (f.endsWith(".json")) runs[stamp].json = f;
    if (f.endsWith(".md")) runs[stamp].md = f;
  }
  return Object.values(runs).sort((a, b) => b.stamp.localeCompare(a.stamp));
}

function readSummary(jsonName) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, jsonName), "utf8"));
  } catch {
    return null;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function indexHtml() {
  const runs = listRuns();
  const cards = runs.map((r) => {
    const data = r.json ? readSummary(r.json) : null;
    let cls = "";
    let summaryText = "No summary available";
    let urlLine = "";
    let bugLine = "";
    if (data) {
      cls = data.summary.failed === 0 ? "pass" : "fail";
      summaryText = `${data.summary.passed}/${data.summary.total} passed (${(data.summary.passRate * 100).toFixed(1)}%)`;
      urlLine = `<p class="url">${escapeHtml(data.url)}</p>`;
      bugLine = data.bugs.length
        ? `<p class="bugs">${data.bugs.length} bug(s) — ${
            data.bugs.filter((b) => b.severity === "critical").length
          } critical, ${data.bugs.filter((b) => b.severity === "high").length} high</p>`
        : `<p class="bugs">No bugs detected</p>`;
    }
    return `<div class="run ${cls}">
      <h3>${escapeHtml(r.stamp)}</h3>
      ${urlLine}
      <p class="summary">${escapeHtml(summaryText)}</p>
      ${bugLine}
      <p class="links">
        ${r.md ? `<a href="/view/${encodeURIComponent(r.md)}">Markdown report</a>` : ""}
        ${r.md && r.json ? " · " : ""}
        ${r.json ? `<a href="/${encodeURIComponent(r.json)}" target="_blank">JSON</a>` : ""}
      </p>
    </div>`;
  }).join("");

  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>AI QA Engineer · Report Viewer</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
         max-width: 960px; margin: 2rem auto; padding: 0 1.5rem; color: #1a1a1a; line-height: 1.5; }
  h1 { border-bottom: 2px solid #eee; padding-bottom: .5rem; }
  .meta { color: #666; font-size: .9rem; }
  .run { background: #fafafa; border: 1px solid #e5e5e5; border-radius: 8px;
         padding: 1rem 1.5rem; margin: 1rem 0; }
  .run.pass { border-left: 4px solid #16a34a; }
  .run.fail { border-left: 4px solid #dc2626; }
  .run h3 { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: .85rem; color: #666; font-weight: 500; }
  .summary { font-size: 1.1rem; font-weight: 500; margin: .5rem 0 .25rem; }
  .url { color: #555; font-size: .9rem; margin: .25rem 0; word-break: break-all; }
  .bugs { color: #555; font-size: .9rem; margin: .25rem 0; }
  .links { margin: .5rem 0 0; }
  a { color: #2563eb; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .empty { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 1.5rem; }
  .empty pre { background: #1f2937; color: #f3f4f6; padding: 1rem; border-radius: 6px; overflow-x: auto; }
  code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px;
         font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
  .empty code { background: transparent; color: inherit; padding: 0; }
  .toolbar { background: #f5f5f5; border: 1px solid #e5e5e5; border-radius: 6px;
             padding: .75rem 1rem; margin-bottom: 1.5rem; font-size: .9rem; color: #555; }
</style>
</head><body>
<h1>AI QA Engineer · Report Viewer</h1>
<div class="toolbar">
  Reports directory: <code>${escapeHtml(ROOT)}</code> · ${runs.length} run(s) ·
  <a href="/">Refresh</a>
</div>
${runs.length === 0 ? `<div class="empty">
  <strong>No reports yet.</strong>
  <p>Generate a real QA report by setting your Anthropic API key and running:</p>
  <pre>cd ai-qa-engineer
export ANTHROPIC_API_KEY=sk-ant-...
npm run qa -- https://example.com</pre>
  <p>Refresh this page after the run completes.</p>
</div>` : cards}
</body></html>`;
}

function viewerHtml(filename, mdContent) {
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>${escapeHtml(filename)} · QA Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
         max-width: 960px; margin: 0 auto; padding: 0 1.5rem 3rem; line-height: 1.6; color: #1a1a1a; }
  .toolbar { background: #f5f5f5; border-bottom: 1px solid #e5e5e5;
             margin: 0 -1.5rem 2rem; padding: 1rem 1.5rem; font-size: .9rem; }
  .toolbar a { color: #2563eb; text-decoration: none; margin-right: 1rem; }
  .toolbar a:hover { text-decoration: underline; }
  pre { background: #f4f4f4; padding: 1rem; border-radius: 6px; overflow-x: auto; }
  code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px;
         font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
  pre code { background: transparent; padding: 0; }
  table { border-collapse: collapse; margin: 1rem 0; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; vertical-align: top; }
  th { background: #f7f7f7; font-weight: 600; }
  h1, h2, h3, h4 { line-height: 1.2; margin-top: 2rem; }
  h1 { border-bottom: 2px solid #eee; padding-bottom: .3rem; }
  blockquote { border-left: 3px solid #ddd; margin-left: 0; padding-left: 1rem; color: #555; }
  hr { border: none; border-top: 1px solid #e5e5e5; margin: 2rem 0; }
  img { max-width: 100%; }
</style>
<script src="https://cdn.jsdelivr.net/npm/marked@12/marked.min.js"></script>
</head><body>
<div class="toolbar">
  <a href="/">← Back to index</a>
  <a href="/${encodeURIComponent(filename)}" target="_blank">Raw markdown</a>
</div>
<div id="content">Rendering…</div>
<script>
  const md = ${JSON.stringify(mdContent)};
  if (window.marked) {
    document.getElementById("content").innerHTML = marked.parse(md, { gfm: true, breaks: false });
  } else {
    const pre = document.createElement("pre");
    pre.textContent = md;
    const c = document.getElementById("content");
    c.textContent = "";
    c.appendChild(pre);
  }
</script>
</body></html>`;
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);

  if (url === "/" || url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(indexHtml());
    return;
  }

  if (url.startsWith("/view/")) {
    const filename = path.basename(url.slice(6));
    const full = path.join(ROOT, filename);
    if (!fs.existsSync(full) || !full.startsWith(ROOT)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(viewerHtml(filename, fs.readFileSync(full, "utf8")));
    return;
  }

  const safeRel = url.replace(/^\/+/, "");
  const full = path.resolve(ROOT, safeRel);
  if (!full.startsWith(ROOT) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }
  const ext = path.extname(full).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(full).pipe(res);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is in use. Set QA_PORT=<other> and retry.`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`Report viewer running at http://localhost:${PORT}`);
});
