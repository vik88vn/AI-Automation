import { Nav } from './components/Nav';
import { Hero } from './components/Hero';
import { Features } from './components/Features';
import { AgentFlow } from './components/AgentFlow';
import { HowItWorks } from './components/HowItWorks';
import { Capabilities } from './components/Capabilities';
import { Pricing } from './components/Pricing';
import { CTA } from './components/CTA';
import { Footer } from './components/Footer';

function App() {
  return (
    <div>
      <Nav />
      <main className="pt-16">
        <Hero />
        <section id="features">
          <Features />
        </section>
        <AgentFlow />
        <section id="how">
          <HowItWorks />
        </section>
        <section>
          <Capabilities />
        </section>
        <section id="pricing">
          <Pricing />
        </section>
        <CTA />
      </main>
      <Footer />
    </div>
  );
}

export default App;
