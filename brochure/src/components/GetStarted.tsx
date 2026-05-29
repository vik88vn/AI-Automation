import { Github } from 'lucide-react';
import { REPO_URL, REPO_CLONE_URL } from '../site';

export function GetStarted() {
  return (
    <section id="get-started">
      <div className="container download">
        <div className="section-head reveal" style={{ marginLeft: 'auto', marginRight: 'auto', textAlign: 'center' }}>
          <span className="eyebrow">Get Started</span>
          <h2>Fork on GitHub, run locally</h2>
          <p style={{ marginLeft: 'auto', marginRight: 'auto' }}>
            Clone the repo, install once, and start the agent. Needs Node 18+ and a
            modern browser. The entire source is yours to inspect, modify and self-host.
          </p>
        </div>

        <a className="btn btn-primary btn-lg reveal" href={REPO_URL} target="_blank" rel="noopener noreferrer">
          <Github className="icon-sm" size={18} />
          View on GitHub
        </a>
        <p className="dl-note">Open source, MIT licensed. Full source, no hidden backend.</p>

        <div className="steps">
          <div className="step reveal">
            <span className="num">1</span>
            <h3>Clone the repo</h3>
            <p>Download the source from GitHub to your machine.</p>
            <div className="code">{`git clone ${REPO_CLONE_URL}
cd ai-qa-engineer`}</div>
          </div>
          <div className="step reveal">
            <span className="num">2</span>
            <h3>Install &amp; start</h3>
            <p>Install dependencies and the browser, then launch the agent server.</p>
            <div className="code">{`npm install
npm run install-browsers
npm run agent:serve`}</div>
          </div>
          <div className="step reveal">
            <span className="num">3</span>
            <h3>Add your AI key</h3>
            <p>In Settings, paste your Claude or OpenAI key — or pick local Ollama.</p>
            <div className="code">{`Settings → AI provider
(key stored in browser only)`}</div>
          </div>
        </div>

        <div className="cta-band reveal">
          <h2>Own your QA, own your code.</h2>
          <p>
            Open source, MIT licensed and fully private. Fork it, deploy it, modify it —
            and start finding bugs in minutes.
          </p>
          <a className="btn btn-primary btn-lg" href={REPO_URL} target="_blank" rel="noopener noreferrer">
            <Github className="icon-sm" size={18} />
            Fork on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
