import { CheckCircle2, ArrowRight } from 'lucide-react';

const steps = [
  {
    number: '1',
    title: 'Enter Target URL',
    description: 'Provide the web application URL you want to test. No setup or configuration needed.',
  },
  {
    number: '2',
    title: 'AI Agent Explores',
    description: 'Our intelligent agent automatically navigates your app, clicking buttons, filling forms, and testing flows.',
  },
  {
    number: '3',
    title: 'Detectors Run',
    description: 'Multiple specialized detectors analyze network, security, accessibility, performance, and more.',
  },
  {
    number: '4',
    title: 'Bugs Reported',
    description: 'Get detailed bug reports with steps to reproduce, screenshots, and evidence of each issue found.',
  },
];

export function HowItWorks() {
  return (
    <section className="py-20">
      <div className="container">
        <div className="text-center mb-16">
          <h2 className="heading-md gradient-text mb-4">How It Works</h2>
          <p className="text-muted text-lg">
            Four simple steps to comprehensive test coverage
          </p>
        </div>

        <div className="grid grid-cols-4 gap-6 mb-12">
          {steps.map((step, idx) => (
            <div key={idx} className="relative">
              <div className="glass p-6 rounded-lg h-full">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center font-bold mb-4 text-white">
                  {step.number}
                </div>
                <h3 className="heading-sm mb-2">{step.title}</h3>
                <p className="text-muted text-sm">{step.description}</p>
              </div>
              {idx < steps.length - 1 && (
                <div className="hidden md:flex absolute -right-3 top-1/3 translate-y-1/2 z-10">
                  <ArrowRight className="text-blue-500" size={24} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Benefits */}
        <div className="glass p-8 rounded-lg mt-12">
          <h3 className="heading-sm mb-6 flex items-center gap-2">
            <CheckCircle2 className="text-green-500" size={24} />
            Why Choose AI QA Engineer?
          </h3>
          <div className="grid grid-cols-2 gap-6">
            <div className="flex gap-3">
              <CheckCircle2 className="text-green-500 shrink-0" size={20} />
              <div>
                <p className="font-semibold mb-1">No Test Code Required</p>
                <p className="text-sm text-muted">Works without writing any automated test scripts</p>
              </div>
            </div>
            <div className="flex gap-3">
              <CheckCircle2 className="text-green-500 shrink-0" size={20} />
              <div>
                <p className="font-semibold mb-1">AI-Powered Intelligence</p>
                <p className="text-sm text-muted">Understands app behavior and finds edge cases</p>
              </div>
            </div>
            <div className="flex gap-3">
              <CheckCircle2 className="text-green-500 shrink-0" size={20} />
              <div>
                <p className="font-semibold mb-1">Complete Coverage</p>
                <p className="text-sm text-muted">Tests network, security, UX, and performance</p>
              </div>
            </div>
            <div className="flex gap-3">
              <CheckCircle2 className="text-green-500 shrink-0" size={20} />
              <div>
                <p className="font-semibold mb-1">Actionable Reports</p>
                <p className="text-sm text-muted">Detailed evidence and reproduction steps included</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
