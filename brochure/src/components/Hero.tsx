import { Github, ArrowRight } from 'lucide-react';
import { REPO_URL } from '../site';
import { AgentFlowCanvas } from './AgentFlow';

export function Hero() {
  return (
    <section className="hero">
      <div className="container">
        <span className="eyebrow">Open-source AI QA agent</span>
        <h1>
          Catch bugs before<br />your users do, <span className="accent">automatically</span>.
        </h1>
        <p className="lede">
          AI QA Tester explores your live web app like a real user, then runs eight
          specialized detectors — network, security, accessibility, performance and
          more — powered by <strong>your own AI key</strong>. No test scripts required.
        </p>

        <div className="hero-cta">
          <a className="btn btn-primary btn-lg" href={REPO_URL} target="_blank" rel="noopener noreferrer">
            <Github className="icon-sm" size={18} />
            View on GitHub
          </a>
          <a className="btn btn-ghost btn-lg" href="#features">
            See what&rsquo;s inside
            <ArrowRight className="icon-sm" size={18} />
          </a>
        </div>
        <p className="hero-sub">
          Open source · bring your own AI key (Claude, OpenAI or local Ollama) · runs on your machine.
        </p>

        <div className="hero-shot reveal" id="pipeline">
          <div className="frame">
            <div className="frame-bar">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
              <span className="url">ai-qa-tester — agent pipeline</span>
            </div>
            <AgentFlowCanvas />
          </div>
        </div>
        <p className="hero-sub">
          Interactive: scroll to zoom, drag the canvas to pan, drag any node to rearrange.
        </p>
      </div>
    </section>
  );
}
