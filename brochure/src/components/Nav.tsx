import { useState } from 'react';
import { Github, Menu, Bug } from 'lucide-react';
import { REPO_URL } from '../site';

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className={`nav${open ? ' open' : ''}`} id="nav">
      <div className="container nav-inner">
        <a className="nav-brand" href="#top" aria-label="AI QA Tester home" onClick={() => setOpen(false)}>
          <span className="logo logo-sm" aria-hidden="true">
            <Bug />
          </span>
          <span className="wordmark">AI QA <span className="accent">Tester</span></span>
        </a>

        <nav className="nav-links" aria-label="Primary" onClick={() => setOpen(false)}>
          <a className="navlink" href="#features">Features</a>
          <a className="navlink" href="#pipeline">Pipeline</a>
          <a className="navlink" href="#detectors">Detectors</a>
          <a className="navlink" href="#your-data">Your data</a>
          <a className="navlink" href="#get-started">Get Started</a>
        </nav>

        <div className="nav-cta">
          <a className="btn btn-primary" href={REPO_URL} target="_blank" rel="noopener noreferrer">
            <Github className="icon-sm" size={16} />
            <span className="hide-sm">GitHub</span>
          </a>
          <button
            className="nav-toggle"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <Menu className="icon" />
          </button>
        </div>
      </div>
    </header>
  );
}
