import type {
  AppModel,
  AuthState,
  BugReport,
  EntityEntry,
  FlowEntry,
  FormEntry,
  RouteEntry,
  Severity,
  TestCase,
  TestStep,
} from "./types.js";

const emptyAuth = (): AuthState => ({
  hasLogin: false,
  hasSignup: false,
  hasLogout: false,
  loggedIn: false,
  notes: "",
});

export class AgentState {
  readonly model: AppModel;
  readonly tests: TestCase[] = [];
  readonly bugs: BugReport[] = [];
  private testCounter = 0;
  private bugCounter = 0;

  constructor(startUrl: string) {
    this.model = {
      startUrl,
      routes: [],
      auth: emptyAuth(),
      entities: [],
      flows: [],
      forms: [],
    };
  }

  recordRoute(entry: Partial<RouteEntry> & { url: string }): RouteEntry {
    const existing = this.model.routes.find((r) => r.url === entry.url);
    const merged: RouteEntry = {
      url: entry.url,
      title: entry.title ?? existing?.title ?? "",
      status: entry.status ?? existing?.status ?? 0,
      notes: entry.notes ?? existing?.notes ?? "",
      visitedAt: entry.visitedAt ?? new Date().toISOString(),
    };
    if (existing) {
      Object.assign(existing, merged);
      return existing;
    }
    this.model.routes.push(merged);
    return merged;
  }

  updateAuth(patch: Partial<AuthState>): AuthState {
    Object.assign(this.model.auth, patch);
    return this.model.auth;
  }

  recordEntity(entry: EntityEntry): EntityEntry {
    const existing = this.model.entities.find((e) => e.name === entry.name);
    if (existing) {
      const fieldSet = new Set([...existing.fields, ...entry.fields]);
      existing.fields = [...fieldSet];
      const routeSet = new Set([...existing.routes, ...entry.routes]);
      existing.routes = [...routeSet];
      if (entry.notes) existing.notes = entry.notes;
      return existing;
    }
    this.model.entities.push(entry);
    return entry;
  }

  recordFlow(entry: FlowEntry): FlowEntry {
    const existing = this.model.flows.find((f) => f.name === entry.name);
    if (existing) {
      Object.assign(existing, entry);
      return existing;
    }
    this.model.flows.push(entry);
    return entry;
  }

  recordForm(entry: FormEntry): FormEntry {
    const existing = this.model.forms.find(
      (f) => f.url === entry.url && f.selector === entry.selector
    );
    if (existing) {
      Object.assign(existing, entry);
      return existing;
    }
    this.model.forms.push(entry);
    return entry;
  }

  addTest(input: {
    title: string;
    steps: TestStep[];
    expected: string;
    type: TestCase["type"];
    priority: TestCase["priority"];
  }): TestCase {
    this.testCounter += 1;
    const test: TestCase = {
      id: `TC_${String(this.testCounter).padStart(3, "0")}`,
      title: input.title,
      steps: input.steps,
      expected: input.expected,
      type: input.type,
      priority: input.priority,
      status: "queued",
      attempts: 0,
    };
    this.tests.push(test);
    return test;
  }

  setTestStatus(
    id: string,
    status: TestCase["status"],
    extra?: { error?: string; failedStepIndex?: number; incrementAttempt?: boolean }
  ): TestCase | undefined {
    const t = this.tests.find((x) => x.id === id);
    if (!t) return undefined;
    t.status = status;
    if (extra?.error !== undefined) t.lastError = extra.error;
    if (extra?.failedStepIndex !== undefined) t.failedStepIndex = extra.failedStepIndex;
    if (extra?.incrementAttempt) t.attempts += 1;
    return t;
  }

  reportBug(input: {
    title: string;
    severity: Severity;
    impact: string;
    reproSteps: string[];
    expected: string;
    actual: string;
    url: string;
    screenshot?: string;
    testId?: string;
  }): BugReport {
    this.bugCounter += 1;
    const bug: BugReport = {
      id: `BUG_${String(this.bugCounter).padStart(3, "0")}`,
      ...input,
      reportedAt: new Date().toISOString(),
    };
    this.bugs.push(bug);
    return bug;
  }

  // Compact snapshot fed back to Claude every turn — keeps context cost low.
  snapshot(): string {
    const m = this.model;
    return JSON.stringify(
      {
        startUrl: m.startUrl,
        routes: m.routes.slice(-15).map((r) => ({
          url: r.url,
          title: r.title,
          status: r.status,
          notes: r.notes ? r.notes.slice(0, 100) : "",
        })),
        auth: m.auth,
        entities: m.entities.slice(-10),
        flows: m.flows.slice(-10),
        forms: m.forms.slice(-10).map((f) => ({
          url: f.url,
          selector: f.selector,
          purpose: f.purpose,
          submit: f.submitSelector,
          fields: f.fields.map((fld) => ({
            name: fld.name,
            type: fld.type,
            required: fld.required,
            selector: fld.selector,
          })),
        })),
        tests: this.tests.map((t) => ({
          id: t.id,
          title: t.title,
          type: t.type,
          priority: t.priority,
          status: t.status,
          attempts: t.attempts,
          lastError: t.lastError ? t.lastError.slice(0, 120) : undefined,
        })),
        bugs: this.bugs.map((b) => ({
          id: b.id,
          title: b.title,
          severity: b.severity,
          testId: b.testId,
        })),
      },
      null,
      2
    );
  }

  coverageOk(): { sufficient: boolean; reason: string } {
    const routes = this.model.routes.length;
    const tests = this.tests.length;
    const passed = this.tests.filter((t) => t.status === "passed").length;
    const failed = this.tests.filter((t) => t.status === "failed").length;
    const queued = this.tests.filter((t) => t.status === "queued").length;
    if (routes >= 4 && tests >= 6 && passed + failed >= 5 && queued === 0) {
      return {
        sufficient: true,
        reason: `coverage met: ${routes} routes, ${tests} tests (${passed} pass / ${failed} fail)`,
      };
    }
    return { sufficient: false, reason: "coverage incomplete" };
  }
}
