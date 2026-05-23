import {
  AlertTriangle,
  Eye,
  Lock,
  Zap,
  BarChart3,
  Accessibility,
  Search,
} from 'lucide-react';

const features = [
  {
    icon: AlertTriangle,
    title: 'Network Failures',
    description: 'Detects failed API calls, timeouts, and connection errors before they impact users.',
    color: 'from-orange-500 to-red-500',
  },
  {
    icon: Lock,
    title: 'Security Vulnerabilities',
    description: 'Identifies XSS, CSRF, injection attacks, and missing security headers.',
    color: 'from-red-500 to-pink-500',
  },
  {
    icon: Accessibility,
    title: 'Accessibility Issues',
    description: 'Finds missing alt text, low contrast ratios, and keyboard navigation problems.',
    color: 'from-purple-500 to-indigo-500',
  },
  {
    icon: Zap,
    title: 'Performance Degradation',
    description: 'Measures CLS, LCP, and FID to catch slow page loads and layout shifts.',
    color: 'from-yellow-500 to-orange-500',
  },
  {
    icon: Eye,
    title: 'Race Conditions',
    description: 'Detects timing-dependent failures and asynchronous state issues.',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: BarChart3,
    title: 'Authentication Gaps',
    description: 'Tests login flows, token expiration, and session management edge cases.',
    color: 'from-green-500 to-emerald-500',
  },
  {
    icon: AlertTriangle,
    title: 'Validation Bypass',
    description: 'Attempts to submit invalid data and finds form validation weaknesses.',
    color: 'from-pink-500 to-rose-500',
  },
  {
    icon: Search,
    title: 'SEO & Meta Issues',
    description: 'Checks for missing titles, descriptions, broken links, and unoptimized images.',
    color: 'from-teal-500 to-cyan-500',
  },
];

export function Features() {
  return (
    <section className="py-20">
      <div className="container">
        <div className="text-center mb-16">
          <h2 className="heading-md gradient-text mb-4">Comprehensive Bug Detection</h2>
          <p className="text-muted text-lg">
            Detect 8+ categories of bugs automatically across your web application
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <div key={idx} className="glass p-6 rounded-lg hover:bg-opacity-10 transition-all">
                <div
                  className={`w-12 h-12 rounded-lg bg-gradient-to-br ${feature.color} p-2.5 mb-4 flex items-center justify-center`}
                >
                  <Icon size={24} className="text-white" />
                </div>
                <h3 className="heading-sm mb-2">{feature.title}</h3>
                <p className="text-muted text-sm">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
