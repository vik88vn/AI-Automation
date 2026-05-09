import { useState, useRef, useEffect } from "react";
import { Bot, ChevronDown, ChevronUp, MessageSquare, Send, Wrench } from "lucide-react";
import { useStore } from "@/store/useStore";
import { useSessionStore } from "@/store/useSessionStore";

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

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { bugs, testCases, status } = useStore();
  const activeRunId = useSessionStore((s) => s.activeRunId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (status !== "completed" && status !== "failed") {
    return null;
  }

  const formatTimestamp = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: "user",
      text: text.trim(),
      timestamp: formatTimestamp(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          runId: activeRunId,
          context: { bugs, tests: testCases },
        }),
      });
      const data: ChatResponse = await res.json();

      const agentMessage: ChatMessage = {
        role: "agent",
        text: data.reply,
        timestamp: formatTimestamp(),
      };

      setMessages((prev) => [...prev, agentMessage]);

      if (data.actions?.some((a) => a.type === "fix")) {
        const fixingMessage: ChatMessage = {
          role: "agent",
          text: "Fixing...",
          timestamp: formatTimestamp(),
        };
        setMessages((prev) => [...prev, fixingMessage]);
      }
    } catch {
      const errorMessage: ChatMessage = {
        role: "agent",
        text: "Failed to get a response. Please try again.",
        timestamp: formatTimestamp(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
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
                    className={`rounded-lg px-3 py-2 text-sm ${
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
            disabled={isLoading}
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
            disabled={isLoading}
            className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 disabled:opacity-50 transition-colors"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
