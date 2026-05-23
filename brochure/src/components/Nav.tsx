import { Zap } from 'lucide-react';

export function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/10">
      <div className="container flex items-center justify-between h-16">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
            <Zap className="text-white" size={20} />
          </div>
          <span className="font-bold text-lg">AI QA Tester</span>
        </div>

        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-muted hover:text-white transition text-sm">Features</a>
          <a href="#flow" className="text-muted hover:text-white transition text-sm">Pipeline</a>
          <a href="#how" className="text-muted hover:text-white transition text-sm">How It Works</a>
          <a href="#pricing" className="text-muted hover:text-white transition text-sm">Pricing</a>
        </div>

        <div className="flex gap-3">
          <button className="btn btn-secondary text-sm px-4 py-2">Sign In</button>
          <button className="btn btn-primary text-sm px-4 py-2">Get Started</button>
        </div>
      </div>
    </nav>
  );
}
