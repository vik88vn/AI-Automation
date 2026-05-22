import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, ChevronDown, ChevronUp, MessageSquare, Send, Square, Wrench } from "lucide-react";
import { useStore } from "@/store/useStore";
import { useSessionStore } from "@/store/useSessionStore";
import { apiUrl, accessHeaders } from "@/lib/apiBase";

const SETTINGS_KEY = "ai-qa-deep-agent.settings.v1";

function readSettings(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

interface ChatMessage {
  role: "user" | "agent";
  text: string;
  timestamp: string;
}

interface ChatAction {
  type: "fix";
  bugId: string;
}

interface ChatResponse {
  reply: string;
  actions?: ChatAction[];
}

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFixing, setIsFixing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { bugs, testCases, status } = useStore();
  const activeRunId = useSessionStore((s) => s.activeRunId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addMessage = useCallback((role: "user" | "agent", text: string) => {
    setMessages((prev) => [
      ...prev,
      { role, text, timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
    ]);
  }, []);

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsLoading(false);
    setIsFixing(false);
    addMessage("agent", "Stopped.");
  }, [addMessage]);

  if (status !== "completed" && status !== "failed") {
    return null;
  }

  // Actually call /api/fix for each bug action
  const executeFixes = async (actions: ChatAction[]) => {
    const settings = readSettings();
    const projectRoot = settings.projectRoot;
    if (!projectRoot) {
      addMessage(
        "agent",
        "Cannot fix bugs: no project root is set. Open Settings (gear icon) → Bug Fix Agent → Project root, and set the absolute path to your project source code."
      );
      return;
    }

    setIsFixing(true);
    const fixBugIds = actions.filter((a) => a.type === "fix").map((a) => a.bugId);

    for (const bugId of fixBugIds) {
      // Check if aborted between bugs
      if (!abortRef.current || abortRef.current.signal.aborted) break;

      const bug = bugs.find((b) => b.id === bugId);
      if (!bug) {
        addMessage("agent", `Bug ${bugId} not found — skipping.`);
        continue;
      }

      addMessage("agent", `Fixing ${bugId}: ${bug.title}...`);

      try {
        const res = await fetch(apiUrl("/api/fix"), {
          method: "POST",
<<<<<<< HEAD
          headers: { "content-type": "application/json", ...accessHeaders() },
=======
          headers: { "content-type": "application/json" },
>>>>>>> 4f7ae30 (Add AgentFlow visualization component to home page)
          signal: abortRef.current.signal,
          body: JSON.stringify({
            bug: {
              id: bug.id,
              title: bug.title,
              severity: bug.severity,
              description: bug.description,
              reproSteps: bug.reproSteps,
              expected: bug.expected,
              actual: bug.actual,
              url: bug.url,
              evidence: bug.evidence,
            },
            projectRoot,
            targetUrl: bug.url,
            restartCommand: settings.restartCommand,
            skipRestart: Boolean(settings.skipRestart),
            providerSettings: {
              preferred: settings.preferred ?? "auto",
              anthropicKey: settings.anthropicKey,
              anthropicModel: settings.anthropicModel,
              openaiKey: settings.openaiKey,
              openaiModel: settings.openaiModel,
              ollamaModel: settings.ollamaModel,
              ollamaBaseUrl: settings.ollamaBaseUrl,
            },
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          addMessage("agent", `Failed to fix ${bugId}: ${(err as { error?: string }).error ?? "unknown error"}`);
          continue;
        }

        // Read the SSE stream for fix events
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let fixResult = "";
        if (reader) {
          let running = true;
          while (running) {
            const { done, value } = await reader.read();
            if (done) { running = false; break; }
            const text = decoder.decode(value);

            // Parse SSE events from the stream
            const lines = text.split("\n");
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              try {
                const event = JSON.parse(line.slice(6)) as { type?: string; message?: string; patchedFiles?: Array<{ path: string }> };
                if (event.type === "fix_done") {
                  const fileCount = event.patchedFiles?.length ?? 0;
                  fixResult = `Fixed ${bugId}! ${fileCount} file(s) patched.`;
                  running = false;
                } else if (event.type === "fix_error") {
                  fixResult = `Failed to fix ${bugId}: ${event.message ?? "unknown error"}`;
                  running = false;
                } else if (event.type === "fix_restarting") {
                  // Surface restart progress so the user can see why a fix may
                  // briefly appear stuck while the test app respawns.
                  addMessage("agent", `(${bugId}) ${event.message ?? "restarting target app…"}`);
                } else if (event.type === "fix_patching" || event.type === "fix_analyzing" || event.type === "fix_verifying") {
                  // Progress update — could show but keeping it simple
                }
              } catch {
                // Check for the done event
                if (line.includes("event: done")) {
                  running = false;
                }
              }
            }
          }
        }

        if (fixResult) {
          addMessage("agent", fixResult);
        } else {
          addMessage("agent", `Fix attempt for ${bugId} completed.`);
        }
      } catch (err) {
        addMessage("agent", `Error fixing ${bugId}: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }

    setIsFixing(false);
    addMessage("agent", "All fix attempts completed. You may want to re-run the QA agent to verify the fixes.");
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading || isFixing) return;

    // Create a fresh AbortController for this entire chat + fix sequence
    abortRef.current = new AbortController();

    addMessage("user", text.trim());
    setInput("");
    setIsLoading(true);

    const settings = readSettings();

    try {
      const res = await fetch(apiUrl("/api/chat"), {
        method: "POST",
<<<<<<< HEAD
        headers: { "content-type": "application/json", ...accessHeaders() },
=======
        headers: { "content-type": "application/json" },
>>>>>>> 4f7ae30 (Add AgentFlow visualization component to home page)
        signal: abortRef.current.signal,
        body: JSON.stringify({
          message: text.trim(),
          runId: activeRunId,
          providerSettings: {
            preferred: settings.preferred ?? "auto",
            anthropicKey: settings.anthropicKey,
            anthropicModel: settings.anthropicModel,
            openaiKey: settings.openaiKey,
            openaiModel: settings.openaiModel,
            ollamaModel: settings.ollamaModel,
            ollamaBaseUrl: settings.ollamaBaseUrl,
          },
          context: { bugs, tests: testCases },
        }),
      });
      const data: ChatResponse = await res.json();

      addMessage("agent", data.reply);

      setIsLoading(false);

      // If the LLM returned fix actions, actually execute them
      if (data.actions && data.actions.length > 0) {
        await executeFixes(data.actions);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User clicked Stop — message already added by handleStop
      } else {
        addMessage("agent", "Failed to get a response. Make sure the backend is running and your API key is set in Settings.");
      }
      setIsLoading(false);
      setIsFixing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleFixAll = () => {
    sendMessage(
      "Fix all the bugs you found. Apply patches to the source code and verify the fixes."
    );
  };

  return (
    <div className="bg-zinc-950/90 backdrop-blur-xl border-t border-zinc-800 transition-all duration-300">
      {/* Header bar */}
      <button
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-zinc-800/40 transition-colors"
      >
        <div className="flex items-center gap-2 text-zinc-100">
          <MessageSquare className="w-4 h-4" />
          <span className="text-sm font-medium">Agent Chat</span>
          {isFixing && (
            <span className="text-xs text-amber-300 animate-pulse">Fixing bugs...</span>
          )}
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-zinc-400" />
        ) : (
          <ChevronUp className="w-4 h-4 text-zinc-400" />
        )}
      </button>

      {/* Expandable area */}
      <div
        className={`transition-all duration-300 overflow-hidden ${
          isExpanded ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        {/* Messages area */}
        <div className="h-[300px] overflow-y-auto px-4 py-3 space-y-3 custom-scrollbar">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
              Ask the agent about bugs found in the last run.
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`flex gap-2 max-w-[80%] ${
                  msg.role === "user" ? "flex-row-reverse" : "flex-row"
                }`}
              >
                {msg.role === "agent" && (
                  <div className="flex-shrink-0 mt-1">
                    <Bot className="w-5 h-5 text-zinc-400" />
                  </div>
                )}
                <div>
                  <div
                    className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                      msg.role === "agent"
                        ? "bg-zinc-800/60 text-zinc-100"
                        : "bg-blue-600/20 border border-blue-500/30 text-zinc-100"
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span
                    className={`text-[10px] text-zinc-500 mt-1 block ${
                      msg.role === "user" ? "text-right" : "text-left"
                    }`}
                  >
                    {msg.timestamp}
                  </span>
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-2 items-center">
                <Bot className="w-5 h-5 text-zinc-400" />
                <div className="bg-zinc-800/60 rounded-lg px-3 py-2">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" />
                    <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:0.15s]" />
                    <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:0.3s]" />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 px-4 py-3 border-t border-zinc-800"
        >
          <button
            type="button"
            onClick={handleFixAll}
            disabled={isLoading || isFixing || bugs.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            <Wrench className="w-3.5 h-3.5" />
            Fix All Bugs
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about bugs or request fixes..."
            disabled={isLoading || isFixing}
            className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 disabled:opacity-50 transition-colors"
          />
          {isLoading || isFixing ? (
            <button
              type="button"
              onClick={handleStop}
              className="p-1.5 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
              title="Stop"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
