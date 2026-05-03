import { ClaudeClient, type ClaudeClientOptions } from "../services/claude.js";
import type { ExplorationResult, TestCase } from "../types.js";
import { Logger } from "../utils/logger.js";

export interface PlannerOptions extends ClaudeClientOptions {
  minCases?: number;
  maxCases?: number;
}

export class TestPlanner {
  private readonly client: ClaudeClient;
  private readonly minCases: number;
  private readonly maxCases: number;
  private readonly log = new Logger("planner");

  constructor(opts: PlannerOptions = {}) {
    this.client = new ClaudeClient(opts);
    this.minCases = opts.minCases ?? 10;
    this.maxCases = opts.maxCases ?? 15;
  }

  async plan(exploration: ExplorationResult): Promise<TestCase[]> {
    const tests = await this.client.generateTestPlan(exploration, {
      minCases: this.minCases,
      maxCases: this.maxCases,
    });
    const validated = this.validate(tests, exploration);
    this.log.info("Test plan ready", {
      count: validated.length,
      types: countBy(validated, (t) => t.type),
    });
    return validated;
  }

  private validate(tests: TestCase[], exploration: ExplorationResult): TestCase[] {
    const cleaned = tests.filter((t) => t.steps.length > 0);
    if (cleaned.length === 0) {
      throw new Error("All generated test cases were empty after validation.");
    }
    if (cleaned.length < this.minCases) {
      this.log.warn(
        `Plan has ${cleaned.length} tests, fewer than minimum ${this.minCases}. Proceeding anyway.`
      );
    }

    const seen = new Set<string>();
    return cleaned.map((t, idx) => {
      let id = t.id;
      if (!id || seen.has(id)) id = `TC_${String(idx + 1).padStart(3, "0")}`;
      seen.add(id);

      const steps = t.steps.map((step) => {
        if (step.action === "navigate" && !step.url) {
          return { ...step, url: exploration.startUrl };
        }
        return step;
      });

      // Guarantee the first step is a navigate so each test runs from a clean state.
      if (steps.length > 0 && steps[0].action !== "navigate") {
        steps.unshift({
          action: "navigate",
          description: `Open ${exploration.startUrl}`,
          url: exploration.startUrl,
        });
      }

      return { ...t, id, steps };
    });
  }
}

function countBy<T, K extends string>(arr: T[], key: (t: T) => K): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const item of arr) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
