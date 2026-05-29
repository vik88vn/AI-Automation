import { Bot, Bug, Lock, Accessibility, Gauge, Wrench } from 'lucide-react';

const features = [
  {
    icon: Bot,
    title: 'Autonomous exploration',
    body: 'An AI agent navigates your app like a real user — clicking, filling forms and following flows — discovering what to test on its own.',
  },
  {
    icon: Bug,
    title: 'Eight bug detectors',
    body: 'Network, security, accessibility, performance, race conditions, auth, validation and SEO — all run in parallel on every pass.',
  },
  {
    icon: Lock,
    title: 'Security probing',
    body: 'Reflects XSS payloads, checks CSRF tokens, scans responses for leaked secrets, and flags missing security headers.',
  },
  {
    icon: Accessibility,
    title: 'Accessibility & SEO',
    body: 'Catches missing alt text, low contrast and keyboard traps, plus missing titles, meta tags and broken internal links.',
  },
  {
    icon: Gauge,
    title: 'Web vitals',
    body: 'Measures CLS, LCP and FID on real navigations so you see layout shift and slow paints before your users feel them.',
  },
  {
    icon: Wrench,
    title: 'AI chat & auto-fix',
    body: 'Ask about any bug, then let the agent patch your source and re-verify — using your own model, on your own machine.',
  },
];

export function Features() {
  return (
    <section id="features">
      <div className="container">
        <div className="section-head reveal">
          <span className="eyebrow">Everything in one run</span>
          <h2>A complete QA cockpit</h2>
          <p>
            Six capabilities that turn a single URL into a thorough, evidence-backed
            bug report — without you writing a single test case.
          </p>
        </div>
        <div className="features-grid">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <article className="feature reveal" key={f.title}>
                <span className="f-icon"><Icon className="icon" /></span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
