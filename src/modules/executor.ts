import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { TestCase, TestResult, TestStep } from "../types.js";
import { Logger } from "../utils/logger.js";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; AI-QA-Engineer/1.0; +https://github.com/anthropics/claude-code)";

export interface ExecutorOptions {
  headless?: boolean;
  testTimeoutMs?: number;
  stepTimeoutMs?: number;
  maxRetries?: number;
  screenshotDir?: string;
  userAgent?: string;
}

export class TestExecutor {
  private readonly headless: boolean;
  private readonly testTimeoutMs: number;
  private readonly stepTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly screenshotDir: string;
  private readonly userAgent: string;
  private readonly log = new Logger("executor");

  constructor(opts: ExecutorOptions = {}) {
    this.headless = opts.headless ?? true;
    this.testTimeoutMs = opts.testTimeoutMs ?? 30_000;
    this.stepTimeoutMs = opts.stepTimeoutMs ?? 10_000;
    this.maxRetries = Math.max(0, Math.min(2, opts.maxRetries ?? 2));
    this.screenshotDir = opts.screenshotDir ?? "./reports/screenshots";
    this.userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
  }

  async runAll(testCases: TestCase[]): Promise<TestResult[]> {
    await mkdir(this.screenshotDir, { recursive: true });

    const browser = await chromium.launch({ headless: this.headless });
    const results: TestResult[] = [];
    try {
      for (const tc of testCases) {
        const result = await this.runOneWithRetry(browser, tc);
        results.push(result);
        const icon = result.status === "PASS" ? "[PASS]" : "[FAIL]";
        this.log.info(`${icon} ${tc.id} ${tc.title} (${result.durationMs}ms, attempts=${result.attempts})`);
      }
    } finally {
      await browser.close();
    }
    return results;
  }

  private async runOneWithRetry(browser: Browser, tc: TestCase): Promise<TestResult> {
    let attempt = 0;
    let lastResult: TestResult | null = null;
    while (attempt <= this.maxRetries) {
      const r = await this.runOne(browser, tc, attempt + 1);
      lastResult = r;
      if (r.status === "PASS") return r;
      attempt += 1;
      if (attempt <= this.maxRetries) {
        this.log.warn(`Retrying ${tc.id} (attempt ${attempt + 1}/${this.maxRetries + 1})`);
      }
    }
    return lastResult!;
  }

  private async runOne(browser: Browser, tc: TestCase, attemptNumber: number): Promise<TestResult> {
    const start = Date.now();
    const logs: string[] = [];
    const log = (line: string) => {
      logs.push(`[${new Date().toISOString()}] ${line}`);
    };
    log(`Starting ${tc.id}: ${tc.title} (attempt ${attemptNumber})`);

    let context: BrowserContext | null = null;
    let page: Page | null = null;
    let screenshot: string | undefined;
    let error = "";
    let failedStepIndex: number | undefined;

    const timeoutHandle = setTimeoutPromise(this.testTimeoutMs);

    try {
      context = await browser.newContext({ userAgent: this.userAgent });
      page = await context.newPage();
      page.setDefaultTimeout(this.stepTimeoutMs);
      page.setDefaultNavigationTimeout(this.stepTimeoutMs);

      page.on("pageerror", (err) => log(`pageerror: ${err.message}`));
      page.on("console", (msg) => {
        if (msg.type() === "error") log(`console.error: ${msg.text()}`);
      });

      const steps = tc.steps;
      await Promise.race([
        (async () => {
          for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            log(`Step ${i + 1}/${steps.length}: ${step.action} - ${step.description}`);
            try {
              await this.runStep(page!, step);
            } catch (stepErr) {
              failedStepIndex = i;
              throw stepErr;
            }
          }
        })(),
        timeoutHandle.promise.then(() => {
          throw new Error(`Test exceeded timeout of ${this.testTimeoutMs}ms`);
        }),
      ]);

      log(`Completed ${tc.id} successfully`);
      return {
        id: tc.id,
        title: tc.title,
        type: tc.type,
        priority: tc.priority,
        status: "PASS",
        logs,
        error: "",
        durationMs: Date.now() - start,
        attempts: attemptNumber,
      };
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      log(`FAILED: ${error}`);
      if (page) {
        try {
          const fileName = `${tc.id}_attempt${attemptNumber}_${Date.now()}.png`;
          const filePath = join(this.screenshotDir, fileName);
          await page.screenshot({ path: filePath, fullPage: false });
          screenshot = filePath;
          log(`Screenshot saved: ${filePath}`);
        } catch (screenshotErr) {
          const msg = screenshotErr instanceof Error ? screenshotErr.message : String(screenshotErr);
          log(`Screenshot failed: ${msg}`);
        }
      }
      return {
        id: tc.id,
        title: tc.title,
        type: tc.type,
        priority: tc.priority,
        status: "FAIL",
        logs,
        error,
        durationMs: Date.now() - start,
        attempts: attemptNumber,
        screenshot,
        failedStepIndex,
      };
    } finally {
      timeoutHandle.cancel();
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
    }
  }

  private async runStep(page: Page, step: TestStep): Promise<void> {
    const timeout = step.timeoutMs ?? this.stepTimeoutMs;

    switch (step.action) {
      case "navigate": {
        if (!step.url) throw new Error('navigate step requires "url"');
        const response = await page.goto(step.url, { waitUntil: "domcontentloaded", timeout });
        if (!response) throw new Error(`No response from ${step.url}`);
        if (response.status() >= 500) {
          throw new Error(`Server error: HTTP ${response.status()} from ${step.url}`);
        }
        return;
      }
      case "click": {
        if (!step.selector) throw new Error('click step requires "selector"');
        const locator = page.locator(step.selector).first();
        await locator.waitFor({ state: "visible", timeout });
        await locator.click({ timeout });
        return;
      }
      case "fill": {
        if (!step.selector) throw new Error('fill step requires "selector"');
        const locator = page.locator(step.selector).first();
        await locator.waitFor({ state: "visible", timeout });
        await locator.fill(step.value ?? "", { timeout });
        return;
      }
      case "select": {
        if (!step.selector) throw new Error('select step requires "selector"');
        const locator = page.locator(step.selector).first();
        await locator.waitFor({ state: "visible", timeout });
        await locator.selectOption(step.value ?? "", { timeout });
        return;
      }
      case "wait_for_selector": {
        if (!step.selector) throw new Error('wait_for_selector step requires "selector"');
        await page.locator(step.selector).first().waitFor({ state: "visible", timeout });
        return;
      }
      case "wait_for_url": {
        if (!step.url) throw new Error('wait_for_url step requires "url"');
        await page.waitForURL(step.url, { timeout });
        return;
      }
      case "assert_visible": {
        if (!step.selector) throw new Error('assert_visible step requires "selector"');
        const locator = page.locator(step.selector).first();
        await locator.waitFor({ state: "visible", timeout });
        const visible = await locator.isVisible();
        if (!visible) throw new Error(`Selector not visible: ${step.selector}`);
        return;
      }
      case "assert_text": {
        if (!step.selector) throw new Error('assert_text step requires "selector"');
        if (step.expected === undefined) throw new Error('assert_text step requires "expected"');
        const locator = page.locator(step.selector).first();
        await locator.waitFor({ state: "visible", timeout });
        const actual = (await locator.textContent({ timeout })) ?? "";
        if (!actual.includes(step.expected)) {
          throw new Error(
            `Text assertion failed. Expected: "${step.expected}", got: "${actual.slice(0, 200)}"`
          );
        }
        return;
      }
      case "assert_url": {
        const expected = step.expected ?? step.url;
        if (!expected) throw new Error('assert_url step requires "expected" or "url"');
        const actual = page.url();
        if (!actual.includes(expected)) {
          throw new Error(`URL assertion failed. Expected to contain: "${expected}", got: "${actual}"`);
        }
        return;
      }
      case "assert_status": {
        if (!step.expected) throw new Error('assert_status step requires "expected"');
        const expectedStatus = parseInt(step.expected, 10);
        if (Number.isNaN(expectedStatus)) {
          throw new Error(`Invalid status code: ${step.expected}`);
        }
        const response = await page
          .waitForResponse((r) => r.url() === page.url(), { timeout })
          .catch(() => null);
        if (!response) {
          throw new Error("Could not capture response for status assertion");
        }
        if (response.status() !== expectedStatus) {
          throw new Error(`Expected HTTP ${expectedStatus}, got ${response.status()}`);
        }
        return;
      }
      default: {
        const exhaustive: never = step.action;
        throw new Error(`Unknown action: ${exhaustive}`);
      }
    }
  }
}

interface CancellableTimeout {
  promise: Promise<void>;
  cancel: () => void;
}

function setTimeoutPromise(ms: number): CancellableTimeout {
  let handle: NodeJS.Timeout | undefined;
  const promise = new Promise<void>((resolve) => {
    handle = setTimeout(() => resolve(), ms);
  });
  return {
    promise,
    cancel: () => {
      if (handle) clearTimeout(handle);
    },
  };
}
