import { useState } from "react";
import { Globe, Settings, Zap } from "lucide-react";

export function Home({ onStart }: { onStart: (url: string) => void }) {
  const [url, setUrl] = useState("");
  const [isLaunching, setIsLaunching] = useState(false);
  const [logIndex, setLogIndex] = useState(0);

  const logs = [
    "Initializing Playwright browser...",
    "Loading Anthropic Claude 3.5 Sonnet...",
    "Establishing Secure SSE Connection...",
    "Agent standing by. Launching loop..."
  ];

  const handleLaunch = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLaunching(true);

    const interval = setInterval(() => {
      setLogIndex((prev) => {
        if (prev >= logs.length - 1) {
          clearInterval(interval);
          setTimeout(() => onStart(url), 500);
          return prev;
        }
        return prev + 1;
      });
    }, 500);
  };

  return (
    /* bg-slate-950: Deep dark background */
    /* flex-col items-center justify-center: Centers everything perfectly */
    <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-950 px-4">

      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-4 rounded-full bg-blue-500/10 p-3 ring-1 ring-blue-500/20">
          <Zap className="size-8 text-blue-500" />
        </div>

        {/* bg-gradient-to-r: This creates the premium "Glow" effect */}
        <h1 className="mb-2 text-4xl font-bold tracking-tight text-white sm:text-6xl">
          Autonomous <span className="bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">QA Engineer</span>
        </h1>

        <p className="text-lg text-slate-400">
          The Tester That Never Sleeps or Misses a Bug.
        </p>
      </div>

      <form
        onSubmit={handleLaunch}
        className="w-full max-w-2xl"
      >
        {/* focus-within:ring-2: This makes the border glow when you click inside */}
        <div className="group relative flex items-center rounded-2xl border border-slate-800 bg-slate-900/50 p-2 transition-all focus-within:border-blue-500/50 focus-within:ring-2 focus-within:ring-blue-500/20">
          <Globe className="ml-3 size-5 text-slate-500" />
          <input
            type="text"
            placeholder="Enter website URL to test..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 bg-transparent px-4 py-3 text-lg text-white outline-none placeholder:text-slate-600 font-mono"
          />
          <button
            type="submit"
            className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition-all hover:bg-blue-500 active:scale-95"
          >
            {isLaunching ? logs[logIndex] : "Launch Agent"}
          </button>
        </div>
      </form>
    </div>
  );
}

