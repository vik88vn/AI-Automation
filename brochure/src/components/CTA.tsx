import { Zap, Mail } from 'lucide-react';

export function CTA() {
  return (
    <section className="py-20">
      <div className="container">
        <div className="glass p-12 rounded-lg text-center">
          <div className="flex justify-center mb-6">
            <Zap className="text-blue-500" size={40} />
          </div>
          <h2 className="heading-md mb-4">Ready to Upgrade Your QA?</h2>
          <p className="text-muted text-lg mb-8 max-w-2xl mx-auto">
            Start testing your web applications with AI-powered bug detection today.
            Get comprehensive reports without writing a single test case.
          </p>

          <div className="flex gap-4 justify-center flex-wrap">
            <button className="btn btn-primary flex items-center gap-2">
              Start Free Trial
              <Zap size={18} />
            </button>
            <a href="mailto:contact@example.com" className="btn btn-secondary flex items-center gap-2">
              <Mail size={18} />
              Get in Touch
            </a>
          </div>

          <p className="text-muted text-sm mt-6">
            No credit card required. Start testing in 30 seconds.
          </p>
        </div>
      </div>
    </section>
  );
}
