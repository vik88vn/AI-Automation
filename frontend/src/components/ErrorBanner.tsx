import { AlertTriangle, X, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/store/useSessionStore";

interface Props {
  onOpenSettings: () => void;
}

// Surfaces backend errors (provider unhealthy, missing model, bad API key, …)
// inline so the user sees what to fix rather than an instant silent failure.
export function ErrorBanner({ onOpenSettings }: Props) {
  const error = useSessionStore((s) => s.lastError);
  const clearError = useSessionStore((s) => s.clearError);

  if (!error) return null;

  // Light pattern-match to suggest the most useful next click.
  const looksLikeMissingModel = /not pulled|model_not_found|model.*not found/i.test(error);
  const looksLikeAuth = /api key|unauthorized|401/i.test(error);

  return (
    <div className="mx-5 mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 backdrop-blur-sm animate-fade-in-up">
      <div className="flex items-start gap-3 p-3">
        <div className="size-7 rounded-xl bg-red-500/20 grid place-items-center shrink-0">
          <AlertTriangle className="size-4 text-red-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-red-200 mb-0.5">
            Run failed
          </div>
          <div className="text-xs text-red-100/90 font-mono leading-relaxed break-words">
            {error}
          </div>
          {(looksLikeMissingModel || looksLikeAuth) && (
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={onOpenSettings}>
                <SettingsIcon className="size-3.5" />
                Open settings
              </Button>
              <span className="text-[11px] text-red-200/70">
                {looksLikeMissingModel
                  ? "Set the right Ollama model (or pull the default)."
                  : "Add your API key to continue."}
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={clearError}
          className="text-red-200/60 hover:text-red-100 shrink-0"
          aria-label="Dismiss"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
