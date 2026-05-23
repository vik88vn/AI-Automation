import { useEffect, useRef, useState } from "react";
import { Key, Settings as SettingsIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProviderSettings } from "@/lib/api";

// Single source of truth for the localStorage slot — must match what
// `lib/api.ts` reads when starting a run, and what the HTML dashboard at
// :4310 writes (so settings carry over between the two UIs).
const SETTINGS_KEY = "ai-qa-deep-agent.settings.v1";

const DEFAULT_SETTINGS: Required<ProviderSettings> = {
  preferred: "auto",
  anthropicKey: "",
  anthropicModel: "",
  openaiKey: "",
  openaiModel: "",
  ollamaBaseUrl: "",
  ollamaModel: "",
  projectRoot: "",
  restartCommand: "",
  skipRestart: false,
};

const ANTHROPIC_MODELS = [
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
];
const OPENAI_MODELS = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o3-mini"];
const OLLAMA_MODELS = [
  "llama3.2",
  "llama3.1",
  "qwen2.5",
  "qwen2.5-coder",
  "mistral",
];

function loadSettings(): Required<ProviderSettings> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as ProviderSettings;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s: Required<ProviderSettings>): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

// Mirrors backend `resolveProviderConfig` so the user sees what *will* run.
function resolved(s: Required<ProviderSettings>): { name: string; detail: string; warn: boolean } {
  const pref = s.preferred ?? "auto";
  if (pref === "anthropic")
    return s.anthropicKey
      ? { name: "anthropic", detail: `model=${s.anthropicModel || "claude-opus-4-7"}`, warn: false }
      : { name: "anthropic", detail: "(no key — start will fail)", warn: true };
  if (pref === "openai")
    return s.openaiKey
      ? { name: "openai", detail: `model=${s.openaiModel || "gpt-4o"}`, warn: false }
      : { name: "openai", detail: "(no key — start will fail)", warn: true };
  if (pref === "ollama")
    return {
      name: "ollama",
      detail: `${s.ollamaBaseUrl || "http://localhost:11434"} · model=${s.ollamaModel || "llama3.1"}`,
      warn: false,
    };
  // auto
  if (s.anthropicKey) return { name: "anthropic", detail: `auto · ${s.anthropicModel || "claude-opus-4-7"}`, warn: false };
  if (s.openaiKey) return { name: "openai", detail: `auto · ${s.openaiModel || "gpt-4o"}`, warn: false };
  return {
    name: "ollama",
    detail: `auto · ${s.ollamaBaseUrl || "http://localhost:11434"} · ${s.ollamaModel || "llama3.1"}`,
    warn: false,
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  // Notify the rest of the app that settings changed, so the next run uses them.
  onSaved?: () => void;
}

export function SettingsDialog({ open, onClose, onSaved }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [settings, setSettings] = useState<Required<ProviderSettings>>(() => loadSettings());

  // Sync open prop → <dialog> open state.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      setSettings(loadSettings()); // re-read in case localStorage changed
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  const update = <K extends keyof Required<ProviderSettings>>(
    key: K,
    value: Required<ProviderSettings>[K]
  ) => setSettings((s) => ({ ...s, [key]: value }));

  const onSave = () => {
    saveSettings(settings);
    onSaved?.();
    onClose();
  };

  const onClear = () => {
    if (!confirm("Clear all stored API keys and settings?")) return;
    localStorage.removeItem(SETTINGS_KEY);
    setSettings({ ...DEFAULT_SETTINGS });
  };

  const r = resolved(settings);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        // Backdrop click closes — clicking the dialog itself is blocked
        // by the inner div's stopPropagation.
        if (e.target === dialogRef.current) onClose();
      }}
      className="bg-zinc-900 text-zinc-100 border border-zinc-800 rounded-2xl p-0 max-w-[560px] w-[calc(100%-32px)] backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div onClick={(e) => e.stopPropagation()} className="flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 h-14 border-b border-zinc-800">
          <SettingsIcon className="size-4 text-zinc-400" />
          <h2 className="text-sm font-semibold flex-1">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-xl text-zinc-400 hover:bg-zinc-800 grid place-items-center"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 max-h-[65vh] overflow-y-auto space-y-4">
          <p className="text-xs text-zinc-400">
            API keys are stored in your browser's <code className="bg-zinc-800/80 px-1 py-0.5 rounded">localStorage</code> only —
            sent to the local backend at run time. Ollama is the default; no key needed,
            runs on your machine.
          </p>

          {/* Provider selector */}
          <Section legend="Provider">
            <div className="flex flex-wrap gap-3 text-sm">
              {(["auto", "anthropic", "openai", "ollama"] as const).map((p) => (
                <label key={p} className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="provider"
                    value={p}
                    checked={settings.preferred === p}
                    onChange={() => update("preferred", p)}
                    className="accent-blue-500"
                  />
                  <span className="capitalize">{p}</span>
                </label>
              ))}
            </div>
            <div className="mt-3 text-xs text-zinc-400 font-mono bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2">
              Resolved:{" "}
              <span className={r.warn ? "text-amber-300" : "text-blue-300"}>{r.name}</span>
              {r.detail && <span> — {r.detail}</span>}
            </div>
          </Section>

          {/* Anthropic */}
          <Section legend="Anthropic">
            <Field label="API key" icon={Key}>
              <input
                type="password"
                value={settings.anthropicKey}
                onChange={(e) => update("anthropicKey", e.target.value)}
                placeholder="sk-ant-…"
                className="field-input"
                autoComplete="off"
              />
            </Field>
            <Field label="Model" suggestions={ANTHROPIC_MODELS} listId="anthropic-models">
              <input
                type="text"
                list="anthropic-models"
                value={settings.anthropicModel}
                onChange={(e) => update("anthropicModel", e.target.value)}
                placeholder="claude-opus-4-7"
                className="field-input"
                autoComplete="off"
              />
              <button
                type="button"
                className="ghost-reset"
                onClick={() => update("anthropicModel", "")}
              >
                reset
              </button>
            </Field>
          </Section>

          {/* OpenAI */}
          <Section legend="OpenAI">
            <Field label="API key" icon={Key}>
              <input
                type="password"
                value={settings.openaiKey}
                onChange={(e) => update("openaiKey", e.target.value)}
                placeholder="sk-…"
                className="field-input"
                autoComplete="off"
              />
            </Field>
            <Field label="Model" suggestions={OPENAI_MODELS} listId="openai-models">
              <input
                type="text"
                list="openai-models"
                value={settings.openaiModel}
                onChange={(e) => update("openaiModel", e.target.value)}
                placeholder="gpt-4o"
                className="field-input"
                autoComplete="off"
              />
              <button
                type="button"
                className="ghost-reset"
                onClick={() => update("openaiModel", "")}
              >
                reset
              </button>
            </Field>
          </Section>

          {/* Project Root — for bug fix agent */}
          <Section legend="Bug Fix Agent">
            <Field label="Project root">
              <input
                type="text"
                value={settings.projectRoot}
                onChange={(e) => update("projectRoot", e.target.value)}
                placeholder="/path/to/your/project"
                className="field-input"
              />
              <button
                type="button"
                className="ghost-reset"
                onClick={() => update("projectRoot", "")}
              >
                reset
              </button>
            </Field>
            <p className="text-[11px] text-zinc-500 mt-1">
              Absolute path to the project source code. Required for the "Fix Bug" feature —
              the agent reads and patches files here.
            </p>

            <Field label="Restart cmd">
              <input
                type="text"
                value={settings.restartCommand}
                onChange={(e) => update("restartCommand", e.target.value)}
                placeholder="npm start (auto-detected if empty)"
                className="field-input"
              />
              <button
                type="button"
                className="ghost-reset"
                onClick={() => update("restartCommand", "")}
              >
                reset
              </button>
            </Field>
            <p className="text-[11px] text-zinc-500 mt-1">
              Command to restart the test app after patching. Run from project root.
              Examples: <code className="bg-zinc-800/80 px-1 py-0.5 rounded">npm start</code>,{" "}
              <code className="bg-zinc-800/80 px-1 py-0.5 rounded">node server.js</code>. Leave
              empty to auto-detect from <code className="bg-zinc-800/80 px-1 py-0.5 rounded">package.json</code>.
            </p>

            <label className="flex items-center gap-2 text-xs text-zinc-300 mt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.skipRestart}
                onChange={(e) => update("skipRestart", e.target.checked)}
                className="accent-blue-500"
              />
              <span>Skip restart (my app uses hot-reload like nodemon)</span>
            </label>
          </Section>

          {/* Ollama */}
          <Section legend="Ollama (default — no key required)">
            <Field label="Base URL">
              <input
                type="text"
                value={settings.ollamaBaseUrl}
                onChange={(e) => update("ollamaBaseUrl", e.target.value)}
                placeholder="http://localhost:11434"
                className="field-input"
              />
              <button
                type="button"
                className="ghost-reset"
                onClick={() => update("ollamaBaseUrl", "")}
              >
                reset
              </button>
            </Field>
            <Field label="Model" suggestions={OLLAMA_MODELS} listId="ollama-models">
              <input
                type="text"
                list="ollama-models"
                value={settings.ollamaModel}
                onChange={(e) => update("ollamaModel", e.target.value)}
                placeholder="llama3.1"
                className="field-input"
                autoComplete="off"
              />
              <button
                type="button"
                className="ghost-reset"
                onClick={() => update("ollamaModel", "")}
              >
                reset
              </button>
            </Field>
            <p className="text-[11px] text-zinc-500 mt-1">
              Empty = backend default. Pull a model first:{" "}
              <code className="bg-zinc-800/80 px-1 py-0.5 rounded">ollama pull llama3.2</code>
            </p>
          </Section>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 justify-end px-5 py-3 border-t border-zinc-800 bg-zinc-950/60 rounded-b-2xl">
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear all
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" onClick={onSave}>
            Save
          </Button>
        </div>
      </div>

      {/* Local stylesheet for the inputs/buttons used above. Inline so the
          dialog file remains self-contained. */}
      <style>{`
        .field-input {
          background: rgb(24 24 27 / 0.7);
          color: rgb(244 244 245);
          border: 1px solid rgb(39 39 42);
          border-radius: 0.75rem;
          padding: 0.4rem 0.75rem;
          font: inherit;
          font-family: ui-monospace, SFMono-Regular, monospace;
          font-size: 12px;
          flex: 1;
          min-width: 0;
        }
        .field-input:focus {
          outline: none;
          border-color: rgb(59 130 246 / 0.6);
          box-shadow: 0 0 0 2px rgb(59 130 246 / 0.2);
        }
        .ghost-reset {
          background: transparent;
          color: rgb(161 161 170);
          border: 1px solid rgb(39 39 42);
          border-radius: 0.375rem;
          padding: 0.125rem 0.5rem;
          font-size: 11px;
          cursor: pointer;
          flex: 0 0 auto;
        }
        .ghost-reset:hover {
          color: rgb(96 165 250);
          border-color: rgb(96 165 250);
        }
      `}</style>
    </dialog>
  );
}

function Section({
  legend,
  children,
}: {
  legend: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="border border-zinc-800 rounded-xl p-3 pt-1.5">
      <legend className="text-[10px] uppercase tracking-wider text-zinc-500 px-1">
        {legend}
      </legend>
      <div className="space-y-2">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  children,
  suggestions,
  listId,
  icon: Icon,
}: {
  label: string;
  children: React.ReactNode;
  suggestions?: string[];
  listId?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-zinc-400 w-24 flex-shrink-0 inline-flex items-center gap-1.5">
        {Icon && <Icon className="size-3 text-zinc-500" />}
        {label}
      </label>
      {children}
      {suggestions && listId && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}
