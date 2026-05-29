import { KeyRound, MonitorSmartphone, Code, GitFork } from 'lucide-react';

const items = [
  { icon: KeyRound, title: 'Bring your own key', sub: 'Claude, OpenAI, or local Ollama' },
  { icon: MonitorSmartphone, title: 'Runs on your machine', sub: 'Your app, your browser, your data' },
  { icon: Code, title: 'No test code', sub: 'The agent explores it for you' },
  { icon: GitFork, title: 'Open source MIT', sub: 'Fork, inspect, modify and deploy' },
];

export function Trust() {
  return (
    <section className="trust" aria-label="Why AI QA Tester">
      <div className="container">
        <div className="trust-grid">
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <div className="trust-item" key={it.title}>
                <span className="ti-icon"><Icon className="icon" /></span>
                <div>
                  <b>{it.title}</b>
                  <span>{it.sub}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
