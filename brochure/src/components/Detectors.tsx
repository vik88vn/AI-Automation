import {
  AlertTriangle,
  Lock,
  Accessibility,
  Zap,
  Eye,
  KeyRound,
  ShieldCheck,
  Search,
} from 'lucide-react';

const detectors = [
  { icon: AlertTriangle, name: 'Network', body: 'Failed requests, timeouts and 4xx/5xx errors.' },
  { icon: Lock, name: 'Security', body: 'XSS, CSRF, leaked secrets, missing headers.' },
  { icon: Accessibility, name: 'Accessibility', body: 'Alt text, contrast, labels, keyboard traps.' },
  { icon: Zap, name: 'Performance', body: 'CLS, LCP and FID on real navigations.' },
  { icon: Eye, name: 'Race conditions', body: 'Timing-dependent and async state failures.' },
  { icon: KeyRound, name: 'Authentication', body: 'Login flows, token expiry, session edges.' },
  { icon: ShieldCheck, name: 'Validation', body: 'Forms that accept data they should reject.' },
  { icon: Search, name: 'SEO & meta', body: 'Titles, descriptions and broken links.' },
];

export function Detectors() {
  return (
    <section id="detectors">
      <div className="container">
        <div className="section-head reveal">
          <span className="eyebrow">A closer look</span>
          <h2>Eight detectors, every run</h2>
          <p>
            Each detector specializes in one class of defect and reports with
            evidence — screenshots, reproduction steps and request logs included.
          </p>
        </div>
        <div className="detectors">
          {detectors.map((d) => {
            const Icon = d.icon;
            return (
              <div className="detector reveal" key={d.name}>
                <span className="d-icon"><Icon className="icon" /></span>
                <b>{d.name}</b>
                <p>{d.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
