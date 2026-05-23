import { ArrowRight, Zap } from 'lucide-react';

export function Hero() {
  return (
    <section className="flex flex-col items-center justify-center min-h-screen pt-20 pb-20">
      <div className="container text-center">
        <div className="mb-8">
          <span className="badge">
            <Zap className="inline mr-2" size={16} />
            AI-Powered QA Testing
          </span>
        </div>

        <h1 className="heading-lg gradient-text mb-6">
          Catch Bugs Before Your Users Do
        </h1>

        <p className="text-muted text-xl max-w-2xl mx-auto mb-8">
          Intelligent automated testing that detects network failures, security vulnerabilities,
          accessibility gaps, performance issues, and validation bugs—all without writing a single test case.
        </p>

        <div className="flex gap-4 justify-center flex-wrap mb-16">
          <button className="btn btn-primary flex items-center gap-2">
            Start Testing Now
            <ArrowRight size={20} />
          </button>
          <button className="btn btn-secondary">
            View Live Demo
          </button>
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-3 gap-8 mt-16">
          <div className="glass p-6 rounded-lg">
            <div className="text-2xl font-bold mb-2 gradient-text">8+</div>
            <div className="text-sm text-muted">Bug Detectors</div>
          </div>
          <div className="glass p-6 rounded-lg">
            <div className="text-2xl font-bold mb-2 gradient-text">100%</div>
            <div className="text-sm text-muted">Automated</div>
          </div>
          <div className="glass p-6 rounded-lg">
            <div className="text-2xl font-bold mb-2 gradient-text">5 min</div>
            <div className="text-sm text-muted">Full Test Run</div>
          </div>
        </div>
      </div>
    </section>
  );
}
