import { useStore } from "@/store/useStore";
import { X, Key } from "lucide-react";

export function SettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { apiKey, setApiKey } = useStore();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Key className="size-5 text-blue-500" /> Settings
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="size-6" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Anthropic / OpenAI API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <p className="mt-2 text-xs text-slate-500">
              Your key is stored locally in your browser and never sent to our servers.
            </p>
          </div>
          
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-500 transition-all"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}
