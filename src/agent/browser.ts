import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserToolInput, BrowserToolResult } from "./types.js";

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
            await page
              .waitForLoadState("networkidle", { timeout: 5_000 })
              .catch(() => undefined);
            return { data: { clicked: input.target, finalUrl: page.url() } };
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
      return {
        ok: false,
        action: input.action,
        target: input.target,
        url: page.url(),
        title: await page.title().catch(() => ""),
        error: message,
        durationMs: Date.now() - t0,
      };
    }
  }

  private async timed(
    t0: number,
    input: BrowserToolInput,
    fn: () => Promise<{ data?: unknown; screenshotPath?: string }>
  ): Promise<BrowserToolResult> {
    const result = await fn();
    const page = this.page!;
    return {
      ok: true,
      action: input.action,
      target: input.target,
      url: page.url(),
      title: await page.title().catch(() => ""),
      data: result.data,
      screenshotPath: result.screenshotPath,
      durationMs: Date.now() - t0,
    };
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
}
