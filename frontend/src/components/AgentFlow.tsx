import {
  Accessibility,
  ArrowRight,
  Bug,
  Compass,
  FileCheck2,
  FormInput,
  Gauge,
  GitBranch,
  Globe,
  KeyRound,
  ListChecks,
  Network,
  Play,
  Radio,
  Search,
  ShieldAlert,
  Wrench,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// AgentFlow — a zero-dependency flowchart of how the QA agent works.
//
// Mirrors the real run lifecycle in src/agent/agent.ts: a single autonomous
// forward pass from a submitted URL to a triaged report, streamed live to the
// dashboard over SSE. Built with plain divs + Tailwind (no charting/diagram
// library) to stay consistent with the project's other zero-dep visuals and
// keep the bundle light.
// ─────────────────────────────────────────────────────────────────────────────

type Stage = {
  n: number;
  icon: LucideIcon;
  title: string;
  desc: string;
};

// The six sequential stages, in execution order. Verbs match the agent code:
// explore (deep-agent loop) → generate (add_test) → execute (run_test) →
// detect (deterministic + audit detectors) → analyze (classifyFailure) →
// report (JSON/MD + run_end).
const STAGES: Stage[] = [
  { n: 1, icon: Compass, title: "Explore", desc: "Drives the site — navigate, click, type, extract." },
  { n: 2, icon: ListChecks, title: "Generate", desc: "Queues test cases: smoke, nav, forms, errors." },
  { n: 3, icon: Play, title: "Execute", desc: "Runs each test in a real Playwright browser." },
  { n: 4, icon: Bug, title: "Detect", desc: "8 detectors fire for bugs as it goes." },
  { n: 5, icon: GitBranch, title: "Analyze", desc: "Sorts real bugs from broken tests." },
  { n: 6, icon: FileCheck2, title: "Report", desc: "Repro steps + reports, live to your dashboard." },
];

type Detector = { icon: LucideIcon; label: string; hint: string };

// Five deterministic detectors that fire *during* test execution.
const LIVE_DETECTORS: Detector[] = [
  { icon: Network, label: "Network", hint: "5xx server errors" },
  { icon: KeyRound, label: "Auth", hint: "bypass of gated routes" },
  { icon: Zap, label: "Race", hint: "premature element enablement" },
  { icon: Gauge, label: "Performance", hint: "FCP / TTI budget overruns" },
  { icon: FormInput, label: "Validation", hint: "missing client-side guards" },
];

// Three detectors that audit each page (deduped per-URL) after its tests.
const AUDIT_DETECTORS: Detector[] = [
  { icon: Accessibility, label: "Accessibility", hint: "WCAG: alt text, labels, contrast" },
  { icon: ShieldAlert, label: "Security", hint: "headers, cookies, XSS reflection" },
  { icon: Search, label: "SEO", hint: "meta tags, Web Vitals, image weight" },
];

export function AgentFlow() {
  return (
    <section className="mt-20 mb-24 w-full max-w-5xl animate-fade-in-up">
      {/* Heading */}
      <h2 className="text-center text-lg font-semibold text-zinc-200">How the agent works</h2>
      <p className="mt-1.5 text-center text-xs text-zinc-500">
        One autonomous forward pass — from a single URL to a triaged bug report.
      </p>

      {/* In → out framing: your URL goes in, results stream back live over SSE. */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-blue-200">
          <Globe className="size-3" /> Your URL
        </span>
        <ArrowRight className="size-3 text-zinc-600" />
        <span className="text-zinc-500">autonomous run</span>
        <ArrowRight className="size-3 text-zinc-600" />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-200">
          <Radio className="size-3 animate-pulse-soft" /> Live via SSE
        </span>
      </div>

      {/* Pipeline — horizontal on desktop, stacked on mobile. Arrows rotate to
          point down when stacked. */}
      <div className="mt-8 flex flex-col md:flex-row md:items-stretch">
        {STAGES.map((s, i) => (
          <div key={s.n} className="contents">
            <StageCard stage={s} />
            {i < STAGES.length - 1 && <Connector />}
          </div>
        ))}
      </div>

      {/* Detail: the two stages that carry the most logic. */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <DetectorsCard />
        <AnalysisCard />
      </div>
    </section>
  );
}

function StageCard({ stage }: { stage: Stage }) {
  const Icon = stage.icon;
  return (
    <div className="group relative flex-1 rounded-2xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm p-4 transition-colors hover:border-zinc-700">
      <div className="flex items-center justify-between mb-3">
        <div className="size-9 rounded-xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-zinc-700/50 grid place-items-center transition-transform group-hover:scale-105">
          <Icon className="size-4 text-blue-300" />
        </div>
        <span className="text-[10px] font-mono text-zinc-600">
          {String(stage.n).padStart(2, "0")}
        </span>
      </div>
      <div className="text-sm font-semibold text-zinc-100">{stage.title}</div>
      <p className="mt-1 text-xs text-zinc-500 leading-relaxed">{stage.desc}</p>
    </div>
  );
}

function Connector() {
  return (
    <div className="flex shrink-0 items-center justify-center py-1 md:py-0 md:px-1 text-zinc-700">
      <ArrowRight className="size-4 rotate-90 md:rotate-0" />
    </div>
  );
}

function DetectorChip({ d }: { d: Detector }) {
  const Icon = d.icon;
  return (
    <span
      title={d.hint}
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-800/40 px-2 py-1 text-xs text-zinc-300 transition-colors hover:border-zinc-700 hover:text-zinc-100"
    >
      <Icon className="size-3.5 text-zinc-400" />
      {d.label}
    </span>
  );
}

function DetectorsCard() {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-2">
        <Bug className="size-4 text-amber-300" />
        <span className="text-sm font-semibold text-zinc-200">8 bug detectors</span>
      </div>

      <div className="mt-3 text-[10px] uppercase tracking-wider text-zinc-600">
        Live during test runs
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {LIVE_DETECTORS.map((d) => (
          <DetectorChip key={d.label} d={d} />
        ))}
      </div>

      <div className="mt-4 text-[10px] uppercase tracking-wider text-zinc-600">
        On page audit (per URL)
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {AUDIT_DETECTORS.map((d) => (
          <DetectorChip key={d.label} d={d} />
        ))}
      </div>
    </div>
  );
}

function AnalysisCard() {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-2">
        <GitBranch className="size-4 text-violet-300" />
        <span className="text-sm font-semibold text-zinc-200">Failure triage</span>
      </div>
      <p className="mt-1.5 text-xs text-zinc-500 leading-relaxed">
        Every failed test is classified deterministically — no flaky test ever
        masquerades as a bug.
      </p>

      {/* Branch: a failed test forks into a real bug or a broken test. */}
      <div className="mt-4">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-800/40 px-2.5 py-1.5 text-xs text-zinc-300">
          <XCircle className="size-3.5 text-zinc-500" /> Failed test
        </span>

        <div className="mt-2 ml-3 space-y-2 border-l border-zinc-800 pl-4">
          <BranchOutcome
            icon={Bug}
            tone="danger"
            text="Real bug — filed with severity + repro steps"
          />
          <BranchOutcome
            icon={Wrench}
            tone="ok"
            text="Broken test — a corrected test is generated"
          />
        </div>
      </div>
    </div>
  );
}

function BranchOutcome({
  icon: Icon,
  tone,
  text,
}: {
  icon: LucideIcon;
  tone: "danger" | "ok";
  text: string;
}) {
  return (
    <div className="relative">
      {/* little elbow tick into the branch spine */}
      <span className="absolute -left-4 top-1/2 w-3 -translate-y-1/2 border-t border-zinc-800" />
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs",
          tone === "danger"
            ? "border-red-500/30 bg-red-500/10 text-red-200"
            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
        )}
      >
        <Icon className="size-3.5" />
        {text}
      </div>
    </div>
  );
}
