import { Bug } from 'lucide-react';
import { REPO_URL, CONTACT_EMAIL } from '../site';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <a className="nav-brand" href="#top">
              <span className="logo logo-sm" aria-hidden="true"><Bug /></span>
              <span className="wordmark">AI QA <span className="accent">Tester</span></span>
            </a>
            <p>
              The open-source AI QA agent that explores your web app and finds bugs across
              eight categories. Built with Playwright and React. Bring your own AI key.
            </p>
          </div>
          <div className="footer-cols">
            <div className="footer-col">
              <h4>Product</h4>
              <a href="#features">Features</a>
              <a href="#pipeline">Pipeline</a>
              <a href="#detectors">Detectors</a>
              <a href="#your-data">Your data</a>
            </div>
            <div className="footer-col">
              <h4>Open source</h4>
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub repo</a>
              <a href={`${REPO_URL}/blob/main/README.md`} target="_blank" rel="noopener noreferrer">Documentation</a>
              <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">MIT License</a>
            </div>
            <div className="footer-col">
              <h4>Contact</h4>
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 AI QA Tester. All rights reserved.</span>
          <span>Not affiliated with Anthropic, OpenAI or Ollama. &ldquo;Claude&rdquo; is a trademark of Anthropic.</span>
        </div>
      </div>
    </footer>
  );
}
