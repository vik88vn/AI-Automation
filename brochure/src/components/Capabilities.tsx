import { Code, Workflow, Database, Shield } from 'lucide-react';

const capabilities = [
  {
    icon: Code,
    title: 'Smart Test Generation',
    features: [
      'AI-driven user flow exploration',
      'Dynamic button/link discovery',
      'Form filling with valid data',
      'Multi-step interaction chains',
    ],
  },
  {
    icon: Shield,
    title: 'Security Testing',
    features: [
      'XSS/injection vulnerability detection',
      'CSRF token validation',
      'Secrets and API key scanning',
      'Security header analysis',
    ],
  },
  {
    icon: Workflow,
    title: 'Quality Metrics',
    features: [
      'Cumulative Layout Shift (CLS)',
      'Largest Contentful Paint (LCP)',
      'First Input Delay (FID)',
      'Overall Lighthouse scores',
    ],
  },
  {
    icon: Database,
    title: 'Detailed Reporting',
    features: [
      'Screenshots of issues',
      'Step-by-step reproduction',
      'Network request logs',
      'DOM snapshots and traces',
    ],
  },
];

export function Capabilities() {
  return (
    <section className="py-20">
      <div className="container">
        <div className="text-center mb-16">
          <h2 className="heading-md gradient-text mb-4">Powerful Capabilities</h2>
          <p className="text-muted text-lg">
            Enterprise-grade testing features built for developers
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8">
          {capabilities.map((cap, idx) => {
            const Icon = cap.icon;
            return (
              <div key={idx} className="glass p-8 rounded-lg">
                <div className="flex gap-4 mb-6">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shrink-0">
                    <Icon size={24} className="text-white" />
                  </div>
                  <h3 className="heading-sm flex items-center">{cap.title}</h3>
                </div>
                <ul className="space-y-3">
                  {cap.features.map((feature, fidx) => (
                    <li key={fidx} className="flex gap-3 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                      <span className="text-muted">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
