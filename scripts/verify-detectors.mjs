// Standalone verification for the Week 1 advanced detectors.
// Exercises the detector DOM/header logic directly against BugShop — no LLM.
//
// Writes results synchronously to /tmp/verify-detectors-result.txt so output
// is never lost to stdout buffering. Hard-exits after 30s.
//
// Usage: node scripts/verify-detectors.mjs  (BugShop must be running on :3100)

import { chromium } from "playwright";
import { writeFileSync, appendFileSync } from "node:fs";

const TARGET = process.env.TARGET || "http://localhost:3100";
const OUT = "/tmp/verify-detectors-result.txt";

writeFileSync(OUT, `Detector verification — ${new Date().toISOString()}\nTarget: ${TARGET}\n\n`);
const log = (s) => appendFileSync(OUT, s + "\n");

// Safety net: never hang forever.
const killer = setTimeout(() => {
  log("\n[TIMEOUT] Script exceeded 30s — force exiting.");
  process.exit(2);
}, 30_000);

try {
  log("Launching chromium...");
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  log("Chromium launched.");
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(10_000);

  let lastHeaders = {};
  const resp = await page.goto(TARGET, { waitUntil: "domcontentloaded", timeout: 10_000 });
  log(`Navigated (HTTP ${resp?.status()}).`);
  if (resp) lastHeaders = await resp.allHeaders().catch(() => ({}));

  // 1. Accessibility audit
  const a11y = await page.evaluate(() => {
    const v = [];
    const sel = (el) => (el.id ? `#${el.id}` : el.tagName.toLowerCase());
    for (const img of Array.from(document.querySelectorAll("img")).slice(0, 50))
      if (!img.hasAttribute("alt")) v.push({ selector: sel(img), type: "missing-alt" });
    for (const b of Array.from(document.querySelectorAll("button, a[href], [role='button']")).slice(0, 50)) {
      const t = (b.textContent || "").trim();
      if (!t && !b.getAttribute("aria-label") && !b.getAttribute("title"))
        v.push({ selector: sel(b), type: "no-label" });
    }
    for (const i of Array.from(document.querySelectorAll("input, textarea, select")).slice(0, 50)) {
      if (["hidden", "submit", "button"].includes(i.type)) continue;
      const hasLabel = i.id && document.querySelector(`label[for="${i.id}"]`);
      if (!hasLabel && !i.getAttribute("aria-label") && !i.closest("label") && !i.placeholder)
        v.push({ selector: sel(i), type: "form-label-missing" });
    }
    return v;
  });
  log(`\n[Accessibility] ${a11y.length} violation(s): ${a11y.slice(0, 6).map((x) => `${x.type}@${x.selector}`).join(", ")}`);

  // 2. Security headers
  const checks = [
    ["content-security-policy", "CSP"],
    ["x-frame-options", "X-Frame-Options"],
    ["x-content-type-options", "X-Content-Type-Options"],
    ["strict-transport-security", "HSTS"],
  ];
  let missing = 0;
  const missingList = [];
  for (const [h, name] of checks) {
    if (!lastHeaders[h]) {
      missing++;
      missingList.push(name);
    }
  }
  log(`[Security] ${missing}/4 headers missing: ${missingList.join(", ")}`);

  // 3. SEO + vitals
  const seo = await page.evaluate(() => {
    const issues = [];
    if (!document.title.trim()) issues.push("missing-title");
    if (!document.querySelector('meta[name="description"]')) issues.push("missing-meta-description");
    if (!document.querySelector('meta[name="viewport"]')) issues.push("missing-viewport-meta");
    if (document.querySelectorAll("h1").length === 0) issues.push("missing-h1");
    const fcp = performance.getEntriesByType("paint").find((p) => p.name === "first-contentful-paint")?.startTime;
    return { issues, fcp };
  });
  log(`[SEO] ${seo.issues.length} issue(s): ${seo.issues.join(", ") || "none"} | FCP: ${seo.fcp ? Math.round(seo.fcp) + "ms" : "n/a"}`);

  await browser.close();

  // Summary
  const results = [
    ["Accessibility detector finds violations", a11y.length > 0],
    ["Security detector finds missing headers", missing > 0],
    ["SEO detector runs", true],
  ];
  log("\n── SUMMARY ──");
  for (const [label, pass] of results) log(`[${pass ? "PASS" : "FAIL"}] ${label}`);
  const passed = results.filter(([, p]) => p).length;
  log(`\n${passed}/${results.length} checks passed`);

  clearTimeout(killer);
  process.exit(passed === results.length ? 0 : 1);
} catch (err) {
  log(`\n[ERROR] ${err?.message || err}`);
  log(err?.stack || "");
  clearTimeout(killer);
  process.exit(3);
}
