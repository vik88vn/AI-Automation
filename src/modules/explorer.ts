import { chromium, type Browser, type Page } from "playwright";
import type {
  ExplorationResult,
  FlowInfo,
  FormInfo,
  InputInfo,
  RouteInfo,
} from "../types.js";
import { Logger } from "../utils/logger.js";

export interface ExplorerOptions {
  maxDepth?: number;
  maxPages?: number;
  pageTimeoutMs?: number;
  headless?: boolean;
  userAgent?: string;
}

interface CrawlContext {
  baseOrigin: string;
  visited: Set<string>;
  routes: RouteInfo[];
  forms: FormInfo[];
  features: Set<string>;
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; AI-QA-Engineer/1.0; +https://github.com/anthropics/claude-code)";

export class Explorer {
  private readonly maxDepth: number;
  private readonly maxPages: number;
  private readonly pageTimeoutMs: number;
  private readonly headless: boolean;
  private readonly userAgent: string;
  private readonly log = new Logger("explorer");

  constructor(opts: ExplorerOptions = {}) {
    this.maxDepth = clamp(opts.maxDepth ?? 3, 1, 5);
    this.maxPages = clamp(opts.maxPages ?? 12, 1, 30);
    this.pageTimeoutMs = opts.pageTimeoutMs ?? 15_000;
    this.headless = opts.headless ?? true;
    this.userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
  }

  async explore(startUrl: string): Promise<ExplorationResult> {
    const baseOrigin = new URL(startUrl).origin;
    const ctx: CrawlContext = {
      baseOrigin,
      visited: new Set<string>(),
      routes: [],
      forms: [],
      features: new Set<string>(),
    };

    const browser = await chromium.launch({ headless: this.headless });
    try {
      const context = await browser.newContext({ userAgent: this.userAgent });
      await this.crawl(context, startUrl, 0, ctx);
      await context.close();
    } finally {
      await browser.close();
    }

    const flows = this.deriveFlows(ctx);
    const result: ExplorationResult = {
      startUrl,
      routes: ctx.routes,
      flows,
      forms: ctx.forms,
      features: Array.from(ctx.features).sort(),
    };
    this.log.info("Exploration complete", {
      routes: result.routes.length,
      forms: result.forms.length,
      features: result.features.length,
      flows: result.flows.length,
    });
    return result;
  }

  private async crawl(
    context: Awaited<ReturnType<Browser["newContext"]>>,
    url: string,
    depth: number,
    ctx: CrawlContext
  ): Promise<void> {
    if (depth > this.maxDepth) return;
    if (ctx.routes.length >= this.maxPages) return;
    const normalized = normalizeUrl(url);
    if (ctx.visited.has(normalized)) return;
    ctx.visited.add(normalized);

    const page = await context.newPage();
    try {
      let status = 0;
      const response = await page
        .goto(url, { waitUntil: "domcontentloaded", timeout: this.pageTimeoutMs })
        .catch((err: Error) => {
          this.log.warn(`Failed to load ${url}: ${err.message}`);
          return null;
        });
      if (response) status = response.status();

      // Best-effort settle; never let networkidle block exploration.
      await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});

      const title = (await page.title().catch(() => "")) || "";
      ctx.routes.push({ url: page.url(), title, depth, status });
      this.log.info(`Visited (depth=${depth}, status=${status})`, page.url());

      await this.detectFeatures(page, ctx);

      const pageForms = await this.extractForms(page).catch(() => [] as FormInfo[]);
      ctx.forms.push(...pageForms);

      if (depth < this.maxDepth && ctx.routes.length < this.maxPages) {
        const links = await this.extractInternalLinks(page, ctx.baseOrigin).catch(
          () => [] as string[]
        );
        const fanout = links.slice(0, 4);
        for (const link of fanout) {
          if (ctx.routes.length >= this.maxPages) break;
          await this.crawl(context, link, depth + 1, ctx);
        }
      }
    } finally {
      await page.close().catch(() => {});
    }
  }

  private async extractForms(page: Page): Promise<FormInfo[]> {
    const url = page.url();
    type RawForm = {
      formIndex: number;
      action: string;
      method: string;
      inputs: { name: string; type: string; required: boolean; placeholder: string; label: string; index: number }[];
      hasSubmit: boolean;
    };

    const raw = await page.evaluate((): RawForm[] => {
      const forms = Array.from(document.querySelectorAll("form"));
      return forms.map((form, formIndex) => {
        const inputs = Array.from(
          form.querySelectorAll("input, textarea, select")
        ) as (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)[];

        const fieldData = inputs
          .filter((el) => {
            if (el instanceof HTMLInputElement) {
              return el.type !== "hidden" && el.type !== "submit" && el.type !== "button";
            }
            return true;
          })
          .map((el, index) => {
            const id = el.id;
            let label = "";
            if (id) {
              const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
              if (lbl) label = (lbl.textContent || "").trim();
            }
            if (!label) {
              const wrapping = el.closest("label");
              if (wrapping) label = (wrapping.textContent || "").trim();
            }
            const type = el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase();
            const placeholder =
              "placeholder" in el && typeof el.placeholder === "string" ? el.placeholder : "";
            return {
              name: el.getAttribute("name") || el.id || "",
              type,
              required: el.hasAttribute("required"),
              placeholder,
              label,
              index,
            };
          });

        const hasSubmit =
          form.querySelector('button[type="submit"], input[type="submit"]') !== null;

        return {
          formIndex,
          action: form.getAttribute("action") || "",
          method: (form.getAttribute("method") || "GET").toUpperCase(),
          inputs: fieldData,
          hasSubmit,
        };
      });
    });

    return raw.map((f) => {
      const formSelector = `form >> nth=${f.formIndex}`;
      const inputs: InputInfo[] = f.inputs.map((i) => ({
        name: i.name,
        type: i.type,
        selector: i.name
          ? `${formSelector} >> [name="${cssEscape(i.name)}"]`
          : `${formSelector} >> nth=${i.index}`,
        required: i.required,
        placeholder: i.placeholder,
        label: i.label,
      }));
      return {
        url,
        selector: formSelector,
        action: f.action,
        method: f.method,
        inputs,
        submitSelector: f.hasSubmit
          ? `${formSelector} >> button[type="submit"], ${formSelector} >> input[type="submit"]`
          : `${formSelector} >> button`,
      };
    });
  }

  private async extractInternalLinks(page: Page, baseOrigin: string): Promise<string[]> {
    const hrefs = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
      return anchors.map((a) => a.href).filter((h) => h && h.startsWith("http"));
    });
    const filtered: string[] = [];
    const seen = new Set<string>();
    for (const href of hrefs) {
      try {
        const u = new URL(href);
        if (u.origin !== baseOrigin) continue;
        const norm = normalizeUrl(href);
        if (seen.has(norm)) continue;
        seen.add(norm);
        filtered.push(href);
      } catch {
        continue;
      }
    }
    return filtered;
  }

  private async detectFeatures(page: Page, ctx: CrawlContext): Promise<void> {
    const url = page.url().toLowerCase();
    const path = (() => {
      try {
        return new URL(url).pathname.toLowerCase();
      } catch {
        return "";
      }
    })();

    const authPatterns = ["/login", "/signin", "/sign-in", "/signup", "/sign-up", "/register", "/auth"];
    if (authPatterns.some((p) => path.includes(p))) {
      ctx.features.add("authentication");
    }

    const adminPatterns = ["/admin", "/dashboard", "/account", "/settings"];
    if (adminPatterns.some((p) => path.includes(p))) {
      ctx.features.add("admin_or_dashboard");
    }

    type FeatureSignals = {
      hasPasswordField: boolean;
      hasSearchInput: boolean;
      hasUploadInput: boolean;
      hasTable: boolean;
      hasList: boolean;
      hasPagination: boolean;
      hasModal: boolean;
      formCount: number;
    };
    const signals: FeatureSignals = await page.evaluate(() => ({
      hasPasswordField: document.querySelectorAll('input[type="password"]').length > 0,
      hasSearchInput:
        document.querySelectorAll('input[type="search"], input[name*="search" i]').length > 0,
      hasUploadInput: document.querySelectorAll('input[type="file"]').length > 0,
      hasTable: document.querySelectorAll("table").length > 0,
      hasList: document.querySelectorAll('ul[role="list"], [role="list"], ul.list').length > 0,
      hasPagination:
        document.querySelectorAll('[class*="pagination" i], nav[aria-label*="pag" i]').length > 0,
      hasModal:
        document.querySelectorAll('[role="dialog"], [class*="modal" i][class*="open" i]').length > 0,
      formCount: document.querySelectorAll("form").length,
    }));

    if (signals.hasPasswordField) ctx.features.add("authentication");
    if (signals.hasSearchInput) ctx.features.add("search");
    if (signals.hasUploadInput) ctx.features.add("file_upload");
    if (signals.hasTable || signals.hasList) ctx.features.add("data_listing");
    if (signals.hasTable && signals.formCount > 0) ctx.features.add("crud");
    if (signals.hasPagination) ctx.features.add("pagination");
    if (signals.hasModal) ctx.features.add("modal_interactions");
    if (signals.formCount > 0) ctx.features.add("forms");
  }

  private deriveFlows(ctx: CrawlContext): FlowInfo[] {
    const flows: FlowInfo[] = [];
    const authRoute = ctx.routes.find((r) => /\/(login|signin|sign-in|auth)/i.test(r.url));
    if (authRoute) {
      flows.push({
        name: "Login flow",
        description: "Submit credentials on the authentication page and verify redirect.",
        startUrl: authRoute.url,
      });
    }
    const signupRoute = ctx.routes.find((r) => /\/(signup|sign-up|register)/i.test(r.url));
    if (signupRoute) {
      flows.push({
        name: "Signup flow",
        description: "Complete the registration form and verify account creation.",
        startUrl: signupRoute.url,
      });
    }
    if (ctx.features.has("crud")) {
      const crudRoute = ctx.routes.find((r) => /\/(admin|dashboard|items|posts|users)/i.test(r.url));
      if (crudRoute) {
        flows.push({
          name: "CRUD flow",
          description: "Create, view, edit, and delete an entity from the listing page.",
          startUrl: crudRoute.url,
        });
      }
    }
    return flows;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    if (u.pathname.endsWith("/") && u.pathname !== "/") {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }
    return u.toString();
  } catch {
    return raw;
  }
}

function cssEscape(s: string): string {
  return s.replace(/(["\\])/g, "\\$1");
}
