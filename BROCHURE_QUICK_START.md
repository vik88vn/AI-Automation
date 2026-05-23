# Brochure Quick Start Guide

Your AI QA Tester marketing landing page is ready to deploy! Here's what was created and how to get it live.

## 📦 What Was Created

A complete, production-ready React marketing website in the `brochure/` directory:

```
brochure/
├── src/
│   ├── components/
│   │   ├── Nav.tsx              # Navigation bar (logo + links + CTAs)
│   │   ├── Hero.tsx             # Hero section (value prop + CTA buttons)
│   │   ├── Features.tsx          # 8 bug detectors (grid of feature cards)
│   │   ├── HowItWorks.tsx        # 4-step process + benefits checklist
│   │   ├── Capabilities.tsx      # 4 technical capability cards
│   │   ├── Pricing.tsx           # 3 pricing tiers (Free/Pro/Enterprise)
│   │   ├── CTA.tsx               # Call-to-action banner
│   │   └── Footer.tsx            # Footer with links & social
│   ├── App.tsx                   # Main app component (ties sections together)
│   ├── main.tsx                  # React entry point
│   ├── index.css                 # All styling (dark theme, gradient effects)
│   └── vite-env.d.ts             # TypeScript definitions
├── index.html                    # HTML template
├── package.json                  # Dependencies (React, Vite, TypeScript, Lucide)
├── vite.config.ts                # Vite build configuration
├── tsconfig.json                 # TypeScript config
├── wrangler.toml                 # Cloudflare Pages config
├── README.md                     # Development guide
└── .gitignore                    # Git ignore rules

Additional docs created:
├── BROCHURE_OVERVIEW.md          # Design system, content, features
├── BROCHURE_DEPLOYMENT.md        # Step-by-step deployment instructions
└── .github/workflows/deploy-brochure.yml  # CI/CD pipeline (auto-deploy on push)
```

## 🚀 Deploy to Cloudflare Pages (5 minutes)

### Step 1: Create Pages Project

1. **Log into Cloudflare Dashboard**
2. **Sidebar → Pages → Create Application**
3. **Connect to Git** (select your AI-Automation-QA-Engineer repo)
4. **Configure build**:
   - Framework preset: `None`
   - Build command: `npm run build --prefix brochure`
   - Output directory: `brochure/dist`
5. **Deploy**

Cloudflare will build and deploy. Your site is now live at:
```
https://ai-qa-tester-brochure.pages.dev
```

### Step 2: Connect Custom Domain (Optional)

1. **Pages → ai-qa-tester-brochure → Settings → Custom domain**
2. **Add domain** (e.g., `brochure.example.com`)
3. **Update DNS** (Cloudflare will show you how)
4. **Wait for SSL** (instant, automatic)

Your site is now live at your custom domain:
```
https://brochure.example.com
```

### Step 3: Enable Auto-Deploy (CI/CD)

The GitHub Actions workflow already exists (`.github/workflows/deploy-brochure.yml`).

For auto-deploy on `git push`, add these secrets to your GitHub repo:

1. **Repo Settings → Secrets and variables → Actions**
2. **New repository secret**:
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: (Get from Cloudflare → My Profile → API Tokens → Create custom token)
     - Permissions: `Cloudflare Pages – Edit`
   - Add

3. **New repository secret**:
   - Name: `CLOUDFLARE_ACCOUNT_ID`
   - Value: (From Cloudflare Dashboard sidebar → Account ID)
   - Add

Now when you push to `main`:
```bash
git push origin main
```

GitHub Actions automatically:
1. ✅ Builds: `npm run build --prefix brochure`
2. ✅ Tests: TypeScript compilation
3. ✅ Deploys: To Cloudflare Pages
4. ✅ Live: Updated site in ~30 seconds

## 💻 Local Development

Want to make changes?

```bash
cd brochure
npm install
npm run dev
```

Visit `http://localhost:5174`

Make changes to any file in `src/components/` and they hot-reload instantly.

## 📝 Common Customizations

### Update Headline
Edit `brochure/src/components/Hero.tsx`:
```tsx
<h1 className="heading-lg gradient-text mb-6">
  Your New Headline Here
</h1>
```

### Update Colors
Edit `brochure/src/index.css`:
```css
.gradient-text {
  background: linear-gradient(135deg, #YOUR_COLOR 0%, #ANOTHER_COLOR 100%);
}
```

### Add New Section
1. Create `brochure/src/components/MySectionName.tsx`
2. Import in `brochure/src/App.tsx`
3. Add to main render

Example:
```tsx
// brochure/src/components/Testimonials.tsx
export function Testimonials() {
  return (
    <section className="py-20">
      <div className="container">
        <h2 className="heading-md mb-8">What Users Say</h2>
        {/* your content */}
      </div>
    </section>
  );
}
```

Then in `App.tsx`:
```tsx
import { Testimonials } from './components/Testimonials';

export default function App() {
  return (
    <main>
      <Hero />
      <Features />
      <Testimonials />  {/* NEW */}
      {/* ... */}
    </main>
  );
}
```

Push, and it auto-deploys!

```bash
git add brochure/src/components/Testimonials.tsx brochure/src/App.tsx
git commit -m "Add testimonials section"
git push origin main
```

## 📊 Design System

**Colors**:
- Primary gradient: Blue → Purple (`#3b82f6` → `#a78bfa`)
- Background: Dark (`#0f0f1e` to `#1a1a2e`)
- Text: Light gray (`#e4e4e7`)
- Accents: Green (success), Red (danger), Orange (warning)

**Typography**:
- Headings: Bold, system fonts
- Body: Regular, 1rem
- Small: 0.875rem

**Components**:
- Glass effect (blur + semi-transparent background)
- Gradient text (text color from gradient)
- Badges (small pill-shaped labels)
- Buttons (primary/secondary with hover effects)

## 📱 Responsive

- Desktop: 3-column grid
- Tablet: 2-column grid  
- Mobile: 1-column stack

Works on all devices automatically.

## 🔗 Architecture

```
brochure.example.com          ← Public marketing site (no login)
  ↓
Cloudflare Pages              ← Static hosting + CDN
  ↓
brochure/dist/                ← Built React app (HTML + JS + CSS)
  ↓
User clicks "Get Started"     ← CTA redirects to app

app.example.com               ← Private QA dashboard (Cloudflare Access gated)
  ↓
Cloudflare Pages              ← Static hosting
  ↓
frontend/dist/                ← React app + token in env
  ↓
Railway Backend               ← API server (needs x-qa-token)
```

## 🎯 Next Steps

1. ✅ Deploy to Cloudflare Pages (follow Step 1 above)
2. ✅ Set up auto-deploy (follow Step 3 above)
3. ✅ Connect custom domain (follow Step 2 above)
4. 📝 Customize copy (headlines, descriptions, pricing)
5. 🎨 Update colors to match your brand
6. 📸 Add screenshots/demo video
7. 👤 Add customer testimonials
8. 📞 Set up contact form (future enhancement)
9. 📊 Add analytics (Fathom, Plausible, etc.)

## 📚 Reference Docs

- **Development**: `brochure/README.md` (local dev + build)
- **Deployment**: `BROCHURE_DEPLOYMENT.md` (detailed deployment steps)
- **Design**: `BROCHURE_OVERVIEW.md` (design system + content structure)
- **Code**: Check out `brochure/src/components/` (each component is self-contained)

## 🆘 Troubleshooting

**Build fails locally**:
```bash
cd brochure
npm install
npm run build
```

Check for TypeScript errors. All must pass before deploying.

**Site not updating**:
1. Check GitHub Actions (Actions tab)
2. Clear browser cache (Cmd+Shift+R)
3. Check Cloudflare cache (Dashboard → Caching → Purge)

**Missing styles**:
- CSS is in `brochure/src/index.css` (single file, no Tailwind CDN)
- All utility classes are there
- Check `index.html` loads CSS correctly

## 💡 Tips

- **No login required** on brochure (it's marketing)
- **Auto-deploy** triggered by push to `main`
- **Hot reload** in dev mode for instant feedback
- **TypeScript** catches errors before deploy
- **Responsive** by default (mobile-first design)
- **Fast** – <1s load time via Cloudflare edge

## 🎉 You're Done!

Your marketing brochure is live and ready to drive conversions. Every push to `main` auto-deploys to production in <1 minute.

Start customizing, push changes, watch them go live. 🚀

---

**Next task**: Update the CTA buttons and pricing to link to your actual sign-up flow (currently they're placeholders).

Questions? Check `BROCHURE_DEPLOYMENT.md` for detailed setup steps.
