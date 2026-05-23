import { Github, Twitter, Linkedin } from 'lucide-react';

export function Footer() {
  return (
    <footer className="py-16 border-t border-white/10">
      <div className="container">
        <div className="grid grid-cols-4 gap-8 mb-12">
          <div>
            <h4 className="font-bold mb-4">Product</h4>
            <ul className="space-y-2">
              <li><a href="#" className="text-muted hover:text-white transition">Features</a></li>
              <li><a href="#" className="text-muted hover:text-white transition">Pricing</a></li>
              <li><a href="#" className="text-muted hover:text-white transition">Security</a></li>
              <li><a href="#" className="text-muted hover:text-white transition">API Docs</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4">Company</h4>
            <ul className="space-y-2">
              <li><a href="#" className="text-muted hover:text-white transition">About</a></li>
              <li><a href="#" className="text-muted hover:text-white transition">Blog</a></li>
              <li><a href="#" className="text-muted hover:text-white transition">Contact</a></li>
              <li><a href="#" className="text-muted hover:text-white transition">Status</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4">Legal</h4>
            <ul className="space-y-2">
              <li><a href="#" className="text-muted hover:text-white transition">Privacy</a></li>
              <li><a href="#" className="text-muted hover:text-white transition">Terms</a></li>
              <li><a href="#" className="text-muted hover:text-white transition">License</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4">Follow</h4>
            <div className="flex gap-4">
              <a href="#" className="text-muted hover:text-white transition">
                <Github size={20} />
              </a>
              <a href="#" className="text-muted hover:text-white transition">
                <Twitter size={20} />
              </a>
              <a href="#" className="text-muted hover:text-white transition">
                <Linkedin size={20} />
              </a>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 pt-8 flex items-center justify-between">
          <p className="text-muted text-sm">
            © 2024 AI QA Engineer. All rights reserved.
          </p>
          <p className="text-muted text-sm">
            Made with ❤️ by <a href="#" className="hover:text-white transition">the team</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
