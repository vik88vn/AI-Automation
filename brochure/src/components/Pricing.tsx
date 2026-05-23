import { Check } from 'lucide-react';

const plans = [
  {
    name: 'Starter',
    description: 'Perfect for trying it out',
    price: 'Free',
    period: 'forever',
    features: [
      'Up to 5 test runs per month',
      '3 bug detectors enabled',
      'Basic bug reports',
      'Email support',
      'Community access',
    ],
    cta: 'Start Free',
    highlighted: false,
  },
  {
    name: 'Professional',
    description: 'For active development teams',
    price: '$99',
    period: '/month',
    features: [
      'Unlimited test runs',
      'All 8+ bug detectors',
      'Advanced reporting',
      'API access',
      'Jira & Slack integration',
      'Priority support',
      'Team collaboration',
      'Custom dashboards',
    ],
    cta: 'Get Started',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    description: 'For large organizations',
    price: 'Custom',
    period: 'pricing',
    features: [
      'Everything in Professional',
      'Dedicated support',
      'SLA guarantee',
      'Custom detectors',
      'On-premise option',
      'Advanced analytics',
      'Audit logs',
      'SSO/SAML',
    ],
    cta: 'Contact Sales',
    highlighted: false,
  },
];

export function Pricing() {
  return (
    <section className="py-20">
      <div className="container">
        <div className="text-center mb-16">
          <h2 className="heading-md gradient-text mb-4">Simple, Transparent Pricing</h2>
          <p className="text-muted text-lg">
            Choose the plan that fits your needs
          </p>
        </div>

        <div className="grid grid-cols-3 gap-8">
          {plans.map((plan, idx) => (
            <div
              key={idx}
              className={`rounded-lg overflow-hidden transition-all ${
                plan.highlighted ? 'glass scale-105 ring-2 ring-blue-500' : 'glass'
              }`}
            >
              {plan.highlighted && (
                <div className="bg-gradient-to-r from-blue-500 to-purple-500 text-white py-2 text-center text-sm font-semibold">
                  Most Popular
                </div>
              )}
              <div className="p-8">
                <h3 className="heading-sm mb-2">{plan.name}</h3>
                <p className="text-muted text-sm mb-6">{plan.description}</p>

                <div className="mb-6">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted ml-2">{plan.period}</span>
                </div>

                <button
                  className={`btn w-full mb-8 ${
                    plan.highlighted ? 'btn-primary' : 'btn-secondary'
                  }`}
                >
                  {plan.cta}
                </button>

                <div className="space-y-4">
                  {plan.features.map((feature, fidx) => (
                    <div key={fidx} className="flex gap-3">
                      <Check size={20} className="text-green-500 shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
