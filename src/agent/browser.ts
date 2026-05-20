import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserToolInput, BrowserToolResult, FailureContext } from "./types.js";

interface ExtractedPage {
  url: string;
  title: string;
  status: number;
  headings: string[];
  links: { href: string; text: string }[];
  forms: {
    selector: string;
    method: string;
    action: string;
    submit: string;
    fields: { name: string; type: string; required: boolean; selector: string; label: string }[];
  }[];
  buttons: { text: string; selector: string }[];
  inputs: { name: string; type: string; selector: string; placeholder: string }[];
  textPreview: string;
  consoleErrors: string[];
  networkErrors: string[];
}

export interface BrowserOptions {
  headless: boolean;
  reportDir: string;
  defaultTimeoutMs?: number;
}

export class AgentBrowser {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private consoleErrors: string[] = [];
  private networkErrors: string[] = [];
  private lastStatus = 200;
  // Response headers of the most recent main-document navigation. Used by
  // checkSecurityHeaders() to flag missing CSP / X-Frame-Options / etc.
  private lastResponseHeaders: Record<string, string> = {};
  private lastSetCookies: string[] = [];
  private screenshotsDir: string;
  private defaultTimeoutMs: number;
  private screenshotIndex = 0;

  constructor(private opts: BrowserOptions) {
    this.screenshotsDir = path.join(opts.reportDir, "screenshots");
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 15_000;
  }

  async start(): Promise<void> {
    await mkdir(this.screenshotsDir, { recursive: true });
    this.browser = await chromium.launch({ headless: this.opts.headless });
    this.context = await this.browser.newContext({ viewport: { width: 1280, height: 800 } });
    // tsx / esbuild injects `__name(fn, "name")` references into functions
    // we hand to page.evaluate. That helper doesn't exist in the browser
    // sandbox. Pass the polyfill as a raw string so tsx can't touch it.
    await this.context.addInitScript({
      content:
        "if (typeof globalThis.__name !== 'function') { globalThis.__name = function (fn) { return fn; }; }",
    });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.defaultTimeoutMs);

    this.page.on("console", (msg) => {
      if (msg.type() === "error") {
        this.consoleErrors.push(msg.text().slice(0, 500));
        if (this.consoleErrors.length > 50) this.consoleErrors.shift();
      }
    });
    this.page.on("response", (resp) => {
      const status = resp.status();
      if (status >= 500) {
        this.networkErrors.push(`${status} ${resp.url()}`);
        if (this.networkErrors.length > 50) this.networkErrors.shift();
      }
    });
    this.page.on("pageerror", (err) => {
      this.consoleErrors.push(`pageerror: ${err.message}`.slice(0, 500));
    });
  }

  async stop(): Promise<void> {
    try {
      await this.context?.close();
      await this.browser?.close();
    } catch {
      // best-effort cleanup
    }
    this.context = undefined;
    this.browser = undefined;
    this.page = undefined;
  }

  currentUrl(): string {
    return this.page?.url() ?? "about:blank";
  }

  // Reset the cross-action error buffers. Call this between distinct test runs
  // so a 5xx captured during one test never leaks into a later test's report.
  // The Playwright `page.on("response")` listener stays attached — we only
  // clear the accumulated arrays.
  clearTransientErrors(): void {
    this.networkErrors.length = 0;
    this.consoleErrors.length = 0;
  }

  async execute(input: BrowserToolInput): Promise<BrowserToolResult> {
    const t0 = Date.now();
    if (!this.page) throw new Error("Browser not started");
    const page = this.page;
    try {
      switch (input.action) {
        case "navigate":
          return await this.timed(t0, input, async () => {
            const resp = await page.goto(input.target, {
              waitUntil: "domcontentloaded",
              timeout: this.defaultTimeoutMs,
            });
            this.lastStatus = resp?.status() ?? 0;
            // Snapshot security-relevant response headers for the main document
            // so checkSecurityHeaders() can audit them after navigation.
            if (resp) {
              this.lastResponseHeaders = await resp.allHeaders().catch(() => ({}));
              const sc = this.lastResponseHeaders["set-cookie"];
              this.lastSetCookies = sc ? sc.split("\n") : [];
            }
            await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
            return {
              data: { status: this.lastStatus, finalUrl: page.url() },
            };
          });

        case "click":
          return await this.timed(t0, input, async () => {
            const locator = page.locator(input.target).first();
            await locator.waitFor({ state: "visible", timeout: this.defaultTimeoutMs });
            await locator.click({ timeout: this.defaultTimeoutMs });
            // CRITICAL: locator.click() resolves as soon as the click event
            // fires synchronously. JS fetch() handlers run on the *next* tick
            // and may not have dispatched their request yet. Without this
            // wait, networkidle below sees 0 in-flight requests and returns
            // immediately — meaning we sample networkErrors BEFORE the 5xx
            // response arrives. 250ms gives form submission handlers room to
            // dispatch the fetch and the server time to respond. Empirically
            // tuned against /api/products?q=[*?\ which crashes in ~30ms.
            await page.waitForTimeout(250);
            await page
              .waitForLoadState("networkidle", { timeout: 5_000 })
              .catch(() => undefined);
            return { data: { clicked: input.target, finalUrl: page.url() } };
          });

        case "click_immediate":
          // Race-condition probe: click as soon as the element is attached to
          // the DOM, bypassing visibility/enabled/stability checks. Use this
          // when investigating transient UI states — e.g., a button that is
          // briefly clickable before JS disables it, or a modal that auto-
          // dismisses. Force:true so disabled/overlapped elements still
          // receive the click.
          return await this.timed(t0, input, async () => {
            const locator = page.locator(input.target).first();
            await locator.waitFor({ state: "attached", timeout: 2_000 });
            await locator.click({ force: true, timeout: 1_000, noWaitAfter: true });
            // Same fetch-dispatch race as `click`; settle long enough to
            // capture any 5xx responses from the click handler.
            await page.waitForTimeout(250);
                     const isDisabledNow = await page.evaluate((sel: string) => {
              const el = document.querySelector(sel);
              if (!el) return false;
              return (el as HTMLButtonElement).disabled ||
                     el.getAttribute("aria-disabled") === "true";
            }, input.target).catch(() => false);

            return {
              data: {
                clicked: input.target,
                finalUrl: page.url(),
                mode: "immediate",
                wasDisabledAfterClick: isDisabledNow,
              },
            };
          });

        case "type":
          return await this.timed(t0, input, async () => {
            if (input.value === undefined) {
              throw new Error("type requires `value`");
            }
            const locator = page.locator(input.target).first();
            await locator.waitFor({ state: "visible", timeout: this.defaultTimeoutMs });
            await locator.fill("");
            await locator.type(input.value, { delay: 10 });
            return {
              data: {
                typedInto: input.target,
                length: input.value.length,
              },
            };
          });

        case "extract":
          return await this.timed(t0, input, async () => {
            const data = await this.extractPage(page, input.target);
            return { data };
          });

        case "screenshot":
          return await this.timed(t0, input, async () => {
            const filePath = await this.takeScreenshot(page, input.target);
            return { data: { path: filePath }, screenshotPath: filePath };
          });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const titleCatch = await page.title().catch(() => "");

      // Build failure context
      const failureContext = await this.buildFailureContext(
        err,
        input.action,
        input.target,
        page,
        titleCatch
      );

      return {
        ok: false,
        action: input.action,
        target: input.target,
        url: page.url(),
        title: titleCatch,
        error: message,
        durationMs: Date.now() - t0,
        failureContext,
      };
    }
  }

  private async buildFailureContext(
    error: unknown,
    action: string,
    target: string,
    page: Page,
    title: string
  ): Promise<FailureContext> {
    const err = error instanceof Error ? error : new Error(String(error));

    // Extract error type from constructor name
    const errorType = err.constructor.name || "Error";
    const errorMessage = err.message || String(error);
    const stackTrace = err.stack;

    // Map action to failure phase
    const failurePhase = this.actionToPhase(action);

    // Validate selector if target looks like a CSS selector (not a URL)
    let selectorValid = false;
    if (action !== "navigate" && target && !target.startsWith("http")) {
      const check = await this.validateSelector(page, target);
      selectorValid = check.found;
    }

    return {
      errorType,
      errorMessage,
      stackTrace,
      failurePhase,
      selectorValid,
      pageState: {
        url: page.url(),
        title,
        consoleErrors: [...this.consoleErrors],
        networkErrors: [...this.networkErrors],
      },
    };
  }

  private actionToPhase(
    action: string
  ): "navigate" | "extract" | "click" | "type" | "assertion" {
    switch (action) {
      case "navigate":
        return "navigate";
      case "click":
      case "click_immediate":
        return "click";
      case "type":
        return "type";
      case "extract":
        return "extract";
      default:
        return "assertion";
    }
  }

  private async validateSelector(
    page: Page,
    selector: string
  ): Promise<{ found: boolean; visible: boolean }> {
    try {
      const found = await page.evaluate((sel: string) => {
        return document.querySelectorAll(sel).length > 0;
      }, selector);

      if (!found) {
        return { found: false, visible: false };
      }

      const visible = await page.evaluate((sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0"
        );
      }, selector);

      return { found: true, visible };
    } catch {
      return { found: false, visible: false };
    }
  }

  private async timed(
    t0: number,
    input: BrowserToolInput,
    fn: () => Promise<{ data?: unknown; screenshotPath?: string }>
  ): Promise<BrowserToolResult> {
    // Snapshot error counts BEFORE the action so we can return only the
    // errors that fired during *this* action, not stale ones from earlier
    // steps. This is critical: surfacing the full networkErrors history
    // would cause the agent to repeatedly file the same bug on every
    // subsequent action.
    const networkBefore = this.networkErrors.length;
    const consoleBefore = this.consoleErrors.length;

    const result = await fn();
    const page = this.page!;
    const durationMs = Date.now() - t0;

    const newNetworkErrors = this.networkErrors.slice(networkBefore);
    const newConsoleErrors = this.consoleErrors.slice(consoleBefore);

    // Capture performance metrics for navigate actions
    let metrics = undefined;
    if (input.action === "navigate") {
      metrics = await this.capturePerformanceMetrics(page, durationMs);
    }

    // Merge any new errors that fired during this action into the data
    // payload so the LLM can see them in the tool result and reason
    // about them (e.g., "click triggered a 500 — file a bug").
    let augmentedData: unknown = result.data;
    if (
      result.data &&
      typeof result.data === "object" &&
      !Array.isArray(result.data) &&
      (newNetworkErrors.length > 0 || newConsoleErrors.length > 0)
    ) {
      augmentedData = {
        ...(result.data as Record<string, unknown>),
        ...(newNetworkErrors.length > 0 ? { networkErrors: newNetworkErrors } : {}),
        ...(newConsoleErrors.length > 0 ? { consoleErrors: newConsoleErrors } : {}),
      };
    }

    return {
      ok: true,
      action: input.action,
      target: input.target,
      url: page.url(),
      title: await page.title().catch(() => ""),
      data: augmentedData,
      screenshotPath: result.screenshotPath,
      durationMs,
      metrics,
    };
  }

  private async capturePerformanceMetrics(page: Page, actionDurationMs: number) {
    try {
      // Get navigation timing data
      const navigationData = await page.evaluate(() => {
        const t = performance.timing;
        return {
          navigationStart: t.navigationStart,
          fetchStart: t.fetchStart,
          domInteractive: t.domInteractive,
          domContentLoaded: t.domContentLoadedEventEnd,
          loadComplete: t.loadEventEnd,
        };
      }).catch(() => null);

      if (!navigationData) return undefined;

      // Get paint entries (FCP)
      const paintEntries = await page.evaluate(() => {
        return performance.getEntriesByType("paint").map((entry) => ({
          name: entry.name,
          startTime: entry.startTime,
        }));
      }).catch(() => []);

      const fcp = paintEntries.find((p) => p.name === "first-contentful-paint")?.startTime;

      // Estimate LCP (largest contentful paint) - approximate using document ready
      // In a real scenario, would use PerformanceObserver, but Playwright has limitations
      const lcp = navigationData.domContentLoaded > 0
        ? navigationData.domContentLoaded - navigationData.navigationStart + 100
        : undefined;

      // Estimate TTI (time to interactive) - approximate using load complete
      const tti = navigationData.loadComplete > 0
        ? navigationData.loadComplete - navigationData.navigationStart
        : undefined;

      // Component breakdown: estimate based on action duration
      // This is a simplified heuristic; more accurate tracking would need step-level instrumentation
      const postActionMs = Math.max(100, actionDurationMs * 0.2); // ~20% of time is post-action settling
      const actionMs = actionDurationMs - postActionMs;
      const waitMs = 0; // No wait for navigate action (it's the first action)

      return {
        navigationStart: navigationData.navigationStart,
        fetchStart: navigationData.fetchStart,
        domInteractive: navigationData.domInteractive,
        domContentLoaded: navigationData.domContentLoaded,
        loadComplete: navigationData.loadComplete,
        fcp,
        lcp,
        tti,
        componentBreakdown: {
          waitMs,
          actionMs: Math.round(actionMs),
          postActionMs: Math.round(postActionMs),
        },
      };
    } catch {
      return undefined;
    }
  }

  private async takeScreenshot(page: Page, target: string): Promise<string> {
    this.screenshotIndex += 1;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `shot-${String(this.screenshotIndex).padStart(3, "0")}-${stamp}.png`;
    const filePath = path.join(this.screenshotsDir, filename);
    if (target && target.toLowerCase() !== "page" && target.trim().length > 0) {
      const locator = page.locator(target).first();
      await locator.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
      const buffer = await locator.screenshot();
      await writeFile(filePath, buffer);
    } else {
      await page.screenshot({ path: filePath, fullPage: true });
    }
    return filePath;
  }

  private async extractPage(page: Page, target: string): Promise<ExtractedPage | unknown> {
    if (target && target.trim() && target.toLowerCase() !== "page") {
      const locator = page.locator(target).first();
      const count = await page.locator(target).count();
      const html = await locator.innerHTML().catch(() => "");
      const text = await locator.innerText().catch(() => "");
      return { selector: target, count, text: text.slice(0, 2000), html: html.slice(0, 2000) };
    }
    const consoleErrors = [...this.consoleErrors];
    const networkErrors = [...this.networkErrors];
    const data = await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
        .slice(0, 20)
        .map((el) => (el.textContent || "").trim())
        .filter(Boolean);

      const links = Array.from(document.querySelectorAll("a[href]"))
        .slice(0, 60)
        .map((a) => ({
          href: (a as HTMLAnchorElement).href,
          text: ((a as HTMLAnchorElement).innerText || (a as HTMLAnchorElement).title || "")
            .trim()
            .slice(0, 80),
        }));

      const cssSelector = (el: Element): string => {
        if ((el as HTMLElement).id) return `#${(el as HTMLElement).id}`;
        const name = (el as HTMLElement).getAttribute("name");
        if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
        const aria = el.getAttribute("aria-label");
        if (aria) return `${el.tagName.toLowerCase()}[aria-label="${aria}"]`;
        const dataTestId = el.getAttribute("data-testid");
        if (dataTestId) return `[data-testid="${dataTestId}"]`;
        const cls = (el as HTMLElement).className;
        if (typeof cls === "string" && cls.trim()) {
          const first = cls.trim().split(/\s+/)[0];
          return `${el.tagName.toLowerCase()}.${first}`;
        }
        return el.tagName.toLowerCase();
      };

      const labelFor = (input: HTMLInputElement): string => {
        if (input.id) {
          const lbl = document.querySelector(`label[for="${input.id}"]`);
          if (lbl) return (lbl.textContent || "").trim();
        }
        const parentLabel = input.closest("label");
        if (parentLabel) return (parentLabel.textContent || "").trim();
        return input.placeholder || input.name || "";
      };

      const forms = Array.from(document.querySelectorAll("form"))
        .slice(0, 12)
        .map((form) => {
          const fields = Array.from(form.querySelectorAll("input, textarea, select"))
            .slice(0, 20)
            .map((field) => {
              const f = field as HTMLInputElement;
              return {
                name: f.name || f.id || "",
                type: f.type || f.tagName.toLowerCase(),
                required: f.required,
                selector: cssSelector(f),
                label: labelFor(f),
              };
            });
          const submit = form.querySelector(
            'button[type="submit"], input[type="submit"], button'
          );
          return {
            selector: cssSelector(form),
            method: (form.method || "get").toLowerCase(),
            action: form.action || "",
            submit: submit ? cssSelector(submit) : "",
            fields,
          };
        });

      const buttons = Array.from(document.querySelectorAll("button, [role='button']"))
        .slice(0, 30)
        .map((b) => ({
          text: ((b as HTMLElement).innerText || "").trim().slice(0, 60),
          selector: cssSelector(b),
        }))
        .filter((b) => b.text.length > 0);

      const inputs = Array.from(document.querySelectorAll("input, textarea, select"))
        .slice(0, 30)
        .map((field) => {
          const f = field as HTMLInputElement;
          return {
            name: f.name || f.id || "",
            type: f.type || f.tagName.toLowerCase(),
            selector: cssSelector(f),
            placeholder: f.placeholder || "",
          };
        });

      const textPreview = (document.body?.innerText || "").trim().slice(0, 1500);

      return {
        url: location.href,
        title: document.title,
        headings,
        links,
        forms,
        buttons,
        inputs,
        textPreview,
      };
    });

    return {
      ...data,
      status: this.lastStatus,
      consoleErrors,
      networkErrors,
    } as ExtractedPage;
  }

  // ── Advanced detector helpers ──────────────────────────────────────────
  //
  // These run in-page DOM audits and header inspections to gather evidence
  // for the accessibility / security / SEO+perf detectors in agent.ts. They
  // are read-only: they never mutate page state, so they're safe to call at
  // any test boundary.

  // Accessibility audit: scans the live DOM for the most common, highest-impact
  // WCAG violations — images without alt text, buttons/links without an
  // accessible name, and form inputs without an associated label.
  async extractA11yViolations(): Promise<
    Array<{ selector: string; type: string; html: string; ariaLabel?: string; contrastRatio?: number }>
  > {
    if (!this.page) return [];
    return await this.page
      .evaluate(() => {
        const violations: Array<{ selector: string; type: string; html: string; ariaLabel?: string }> = [];

        const sel = (el: Element): string => {
          if (el.id) return `#${el.id}`;
          const cls = (el.className || "").toString().trim().split(/\s+/)[0];
          return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
        };
        const snippet = (el: Element): string => el.outerHTML.slice(0, 200);

        // 1. Images without alt text
        for (const img of Array.from(document.querySelectorAll("img")).slice(0, 50)) {
          if (!img.hasAttribute("alt")) {
            violations.push({ selector: sel(img), type: "missing-alt", html: snippet(img) });
          }
        }

        // 2. Buttons / links without an accessible name
        for (const btn of Array.from(document.querySelectorAll("button, a[href], [role='button']")).slice(0, 50)) {
          const text = (btn.textContent || "").trim();
          const ariaLabel = btn.getAttribute("aria-label") || btn.getAttribute("aria-labelledby");
          const title = btn.getAttribute("title");
          if (!text && !ariaLabel && !title) {
            violations.push({
              selector: sel(btn),
              type: "no-label",
              html: snippet(btn),
              ariaLabel: ariaLabel || undefined,
            });
          }
        }

        // 3. Form inputs without a label (no <label for>, aria-label, or wrapping label)
        for (const input of Array.from(document.querySelectorAll("input, textarea, select")).slice(0, 50)) {
          const el = input as HTMLInputElement;
          if (el.type === "hidden" || el.type === "submit" || el.type === "button") continue;
          const id = el.id;
          const hasLabelFor = id && document.querySelector(`label[for="${id}"]`);
          const hasAriaLabel = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby");
          const hasWrappingLabel = el.closest("label");
          const hasPlaceholder = el.placeholder;
          if (!hasLabelFor && !hasAriaLabel && !hasWrappingLabel && !hasPlaceholder) {
            violations.push({ selector: sel(el), type: "form-label-missing", html: snippet(el) });
          }
        }

        return violations.slice(0, 20);
      })
      .catch(() => []);
  }

  // Security header audit: inspects the main-document response headers captured
  // during navigation and flags missing protections. Returns one issue object
  // per missing/weak header. Does not perform active probing (that's done by
  // the agent injecting payloads via the type action).
  checkSecurityHeaders(): Array<{ securityType: string; evidence: string; header?: string }> {
    const issues: Array<{ securityType: string; evidence: string; header?: string }> = [];
    const h = this.lastResponseHeaders;
    // Header names are lowercased by Playwright's allHeaders().
    if (!h["content-security-policy"]) {
      issues.push({
        securityType: "missing-security-headers",
        evidence: "Response is missing Content-Security-Policy header (XSS/injection mitigation)",
        header: "content-security-policy",
      });
    }
    if (!h["x-frame-options"] && !(h["content-security-policy"] || "").includes("frame-ancestors")) {
      issues.push({
        securityType: "missing-security-headers",
        evidence: "Response is missing X-Frame-Options header (clickjacking mitigation)",
        header: "x-frame-options",
      });
    }
    if (!h["x-content-type-options"]) {
      issues.push({
        securityType: "missing-security-headers",
        evidence: "Response is missing X-Content-Type-Options: nosniff header (MIME-sniffing mitigation)",
        header: "x-content-type-options",
      });
    }
    if (!h["strict-transport-security"]) {
      issues.push({
        securityType: "missing-security-headers",
        evidence: "Response is missing Strict-Transport-Security header (HTTPS enforcement)",
        header: "strict-transport-security",
      });
    }
    // Insecure cookies: Set-Cookie without HttpOnly/Secure flags.
    for (const cookie of this.lastSetCookies) {
      const lower = cookie.toLowerCase();
      if (lower && (!lower.includes("httponly") || !lower.includes("secure"))) {
        const name = cookie.split("=")[0];
        issues.push({
          securityType: "insecure-cookie",
          evidence: `Cookie "${name}" missing HttpOnly and/or Secure flag`,
          header: "set-cookie",
        });
        break; // one representative issue is enough
      }
    }
    return issues;
  }

  // Active XSS reflection check: after a payload has been typed into a field and
  // submitted, this checks whether the raw (unescaped) payload appears in the
  // rendered DOM — a strong signal the input is reflected without sanitization.
  async checkXssReflection(payload: string): Promise<boolean> {
    if (!this.page) return false;
    return await this.page
      .evaluate((p: string) => {
        // Look for the raw payload in the HTML source (not textContent, which
        // would be escaped). If the literal <script> survived into innerHTML,
        // it was reflected unsanitized.
        return document.documentElement.innerHTML.includes(p);
      }, payload)
      .catch(() => false);
  }

  // SEO + Web Vitals audit: collects missing SEO tags and approximate
  // Core Web Vitals, plus a list of oversized image assets. Web Vitals here
  // are best-effort from the Performance API (CLS via LayoutShift entries,
  // LCP via the largest-contentful-paint entry when available).
  async measureSeoAndVitals(): Promise<{
    seoIssues: string[];
    webVitals: { fcp?: number; lcp?: number; cls?: number };
    unoptimizedAssets: Array<{ url: string; type: string; size: number }>;
  }> {
    if (!this.page) return { seoIssues: [], webVitals: {}, unoptimizedAssets: [] };
    return await this.page
      .evaluate(() => {
        const seoIssues: string[] = [];
        if (!document.querySelector("title") || !document.title.trim()) {
          seoIssues.push("missing-title");
        }
        if (!document.querySelector('meta[name="description"]')) {
          seoIssues.push("missing-meta-description");
        }
        if (!document.querySelector('meta[name="viewport"]')) {
          seoIssues.push("missing-viewport-meta");
        }
        if (document.querySelectorAll("h1").length === 0) {
          seoIssues.push("missing-h1");
        }
        if (document.querySelectorAll("h1").length > 1) {
          seoIssues.push("multiple-h1");
        }
        // Duplicate IDs (invalid HTML, breaks anchors + a11y)
        const ids = Array.from(document.querySelectorAll("[id]")).map((e) => e.id);
        if (new Set(ids).size !== ids.length) {
          seoIssues.push("duplicate-ids");
        }

        // Web Vitals (best-effort)
        const paint = performance.getEntriesByType("paint");
        const fcp = paint.find((p) => p.name === "first-contentful-paint")?.startTime;

        const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
        const lcp =
          lcpEntries.length > 0 ? (lcpEntries[lcpEntries.length - 1] as PerformanceEntry).startTime : undefined;

        let cls = 0;
        for (const entry of performance.getEntriesByType("layout-shift") as PerformanceEntry[]) {
          const e = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
          if (!e.hadRecentInput && typeof e.value === "number") cls += e.value;
        }

        // Oversized images via Resource Timing (transferSize > 100KB)
        const unoptimizedAssets: Array<{ url: string; type: string; size: number }> = [];
        for (const r of performance.getEntriesByType("resource") as PerformanceResourceTiming[]) {
          if (r.initiatorType === "img" && r.transferSize > 100_000) {
            unoptimizedAssets.push({ url: r.name, type: "image", size: r.transferSize });
          }
        }

        return {
          seoIssues,
          webVitals: { fcp, lcp, cls: Math.round(cls * 1000) / 1000 },
          unoptimizedAssets: unoptimizedAssets.slice(0, 10),
        };
      })
      .catch(() => ({ seoIssues: [], webVitals: {}, unoptimizedAssets: [] }));
  }
}
