import { Check, Sparkles, Bot, Cpu, Lock } from 'lucide-react';
import { REPO_URL } from '../site';

export function YourData() {
  return (
    <section id="your-data">
      <div className="container">
        <div className="split">
          <div className="reveal">
            <span className="eyebrow">Private by design</span>
            <h2 style={{ fontSize: 'clamp(1.8rem, 3.4vw, 2.5rem)', marginTop: 18 }}>
              Your code and your keys never touch our servers
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '1.05rem', marginTop: 14 }}>
              AI QA Tester runs on your own machine. It drives a local browser against
              your app, and talks to whichever AI provider you choose using a key that
              stays on your side. There&rsquo;s no account and no backend holding your data.
            </p>
            <ul className="checklist">
              <li>
                <Check className="icon" />
                <span><b>Bring your own model.</b> Use Anthropic Claude or OpenAI with your key, set right in Settings.</span>
              </li>
              <li>
                <Check className="icon" />
                <span><b>Or use no key at all.</b> Point it at a local <strong>Ollama</strong> model and every AI feature runs fully offline.</span>
              </li>
              <li>
                <Check className="icon" />
                <span><b>Reports stay local.</b> Findings are written to files on your machine — easy to keep, share or delete.</span>
              </li>
              <li>
                <Check className="icon" />
                <span><b>Self-host anything.</b> The whole stack is MIT-licensed — run the agent and dashboard wherever you like.</span>
              </li>
            </ul>
          </div>

          <div className="keycard reveal">
            <div className="keyrow">
              <span className="kr-icon"><Sparkles className="icon" /></span>
              <div>
                <b>Claude (your key)</b>
                <p>Highest-quality exploration and analysis. Requests go straight to Anthropic under your account.</p>
              </div>
            </div>
            <div className="keyrow">
              <span className="kr-icon"><Bot className="icon" /></span>
              <div>
                <b>OpenAI (your key)</b>
                <p>Prefer GPT models? Drop in an OpenAI key and the agent uses it instead.</p>
              </div>
            </div>
            <div className="keyrow">
              <span className="kr-icon"><Cpu className="icon" /></span>
              <div>
                <b>Local Ollama (no key)</b>
                <p>Run a model on your own hardware. Slower, but 100% offline and free.</p>
              </div>
            </div>
            <div className="keyrow">
              <span className="kr-icon"><Lock className="icon" /></span>
              <div>
                <b>You&rsquo;re always in control</b>
                <p>Swap providers, switch to local, or clear data anytime. It&rsquo;s all in the <a className="inline" style={{ color: 'var(--b400)' }} href={REPO_URL} target="_blank" rel="noopener noreferrer">open source</a>.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
