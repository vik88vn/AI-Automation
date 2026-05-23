# Brochure Site Deployment Guide

This guide covers deploying the AI QA Tester marketing brochure to Cloudflare Pages.

## Overview

The brochure is a separate, **public-facing** React site (no authentication) that:
- Showcases product features and benefits
- Explains how the tool works
- Displays pricing tiers
- Drives signups and conversions
- Lives on a separate domain from the main app

## Architecture

```
┌─────────────────────────────────────────┐
│    Your Domain (e.g., example.com)      │
├─────────────────────────────────────────┤
│  www.example.com → Cloudflare Pages     │
│  ├─ Brochure site (public, this project)│
│  └─ (Optional) Main app on subdomain    │
│                                         │
│  app.example.com → Cloudflare Pages     │
│  └─ Main QA app (gated by Access)       │
│     → Routes to Railway backend         │
└─────────────────────────────────────────┘
```

Or, use separate domains:

- `brochure.ai-qa-engineer.com` → Brochure (Cloudflare Pages)
- `app.ai-qa-engineer.com` → Main app (Cloudflare Pages + Access)

## Step 1: Create a New Cloudflare Pages Project

### Option A: Via GitHub Integration (Recommended)

1. **Log into Cloudflare Dashboard**
2. **Sidebar → Pages**
3. **Create Application → Connect to Git**
4. **Select your GitHub repo** (ai-qa-engineer)
5. **Authorize Cloudflare** to access your repo
6. **Configure build settings**:
   - **Framework preset**: None
   - **Build command**: `npm run build --prefix brochure`
   - **Build output directory**: `brochure/dist`
7. **Save and deploy**

Cloudflare auto-redeploys on `git push` to `main`.

### Option B: Via CLI (wrangler)

```bash
cd brochure
npx wrangler pages project create ai-qa-tester-brochure
npx wrangler pages deploy dist \
  --project-name=ai-qa-tester-brochure
```

## Step 2: Connect a Custom Domain

1. **Cloudflare Dashboard → Pages → ai-qa-tester-brochure**
2. **Settings → Custom domain**
3. **Add custom domain** (e.g., `brochure.example.com`)
4. **Verify domain ownership** (point nameservers or CNAME to Cloudflare)

Once connected, your brochure is live at `https://brochure.example.com`

## Step 3: Set Up Automatic Deployments

The CI/CD workflow in `.github/workflows/deploy-brochure.yml` automatically deploys when you push changes to `brochure/` folder.

### Prerequisites

Add these secrets to your GitHub repo:

1. **Settings → Secrets and variables → Actions**
2. **Add the following secrets**:

```
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

#### How to get these:

**CLOUDFLARE_API_TOKEN**:
1. Log into Cloudflare
2. **My Profile → API Tokens**
3. **Create Token → Custom token**
4. Grant these permissions:
   - `Cloudflare Pages – Edit`
   - `Account – Pages Analytics`
5. **Copy token** → paste into GitHub secret

**CLOUDFLARE_ACCOUNT_ID**:
1. Cloudflare Dashboard → any page
2. **Sidebar → Overview**
3. **Right panel → Account ID** (copy it)
4. Paste into GitHub secret

## Step 4: Push Changes

Once CI/CD is set up, changes deploy automatically:

```bash
cd /Users/rohailsiddiqi/Documents/ai-qa-engineer
git add brochure/
git commit -m "Update brochure: add testimonials section"
git push origin main
```

GitHub Actions runs the workflow:
- ✅ Install deps
- ✅ Build React app
- ✅ Deploy to Cloudflare Pages

Check status in **GitHub → Actions tab**.

## Local Development

```bash
cd brochure
npm install
npm run dev
```

Visit `http://localhost:5174`

### Make Changes

- Edit `src/components/*.tsx` for sections
- Edit `src/index.css` for styling
- Changes hot-reload in dev mode

## Customization

### Update Copy/Content

- **Nav.tsx**: Navigation bar links
- **Hero.tsx**: Headline, value prop, CTA buttons
- **Features.tsx**: Bug detector descriptions
- **Pricing.tsx**: Plans and pricing
- **Footer.tsx**: Links and contact

### Update Colors

Edit `src/index.css`:
```css
.gradient-text {
  background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%);
}

.btn-primary {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
}
```

Use Tailwind colors: `from-blue-500`, `from-purple-500`, etc.

### Add New Sections

1. Create `src/components/NewSection.tsx`
2. Import in `src/App.tsx`
3. Add to main render

Example:

```tsx
// src/components/Testimonials.tsx
export function Testimonials() {
  return (
    <section className="py-20">
      <div className="container">
        <h2 className="heading-md mb-8">What Users Say</h2>
        {/* testimonial cards */}
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
    <div>
      <Nav />
      <main>
        <Hero />
        <Features />
        <Testimonials />  {/* New section */}
        {/* ... */}
      </main>
    </div>
  );
}
```

## Performance & Optimization

### Current State

- **Size**: ~50KB (minified, gzipped)
- **Load time**: <1s (Cloudflare edge cache)
- **Score**: Lighthouse 95+

### Further Optimization

- Add image compression (next/image equivalent)
- Implement lazy loading for cards
- Cache assets with long TTL

## Troubleshooting

### Deployment Failed

Check GitHub Actions logs:
1. **GitHub → Actions tab**
2. **Select failed workflow run**
3. **Expand "Build brochure" step**
4. Look for error message

Common issues:
- Missing `CLOUDFLARE_API_TOKEN` secret
- Build command wrong (`npm run build` vs `npm run build --prefix brochure`)
- `dist` folder not found (ensure build succeeds locally first)

### Site Not Updating

1. **Clear browser cache** (Cmd+Shift+R on Mac)
2. **Check Cloudflare cache**: Dashboard → Caching → Purge Cache
3. **Verify deployment**: Pages → ai-qa-tester-brochure → Recent deployments

### Images/Assets Not Loading

Check `index.html` and `vite.config.ts`:
- Ensure `base: "/"` in vite.config
- All image paths should be relative or absolute

## DNS & Domain Setup

### If Using a Subdomain (brochure.example.com)

**Option 1: CNAME (easiest)**
```
brochure.example.com CNAME ai-qa-tester-brochure.pages.dev
```

**Option 2: Cloudflare Nameservers**
Point `example.com` nameservers to:
- `ns1.cloudflare.com`
- `ns2.cloudflare.com`

Then add `brochure` subdomain in Cloudflare dashboard.

### SSL/TLS

Cloudflare automatically provisions **free SSL certificate** – no action needed.

## Next Steps

1. ✅ Create Cloudflare Pages project
2. ✅ Set up GitHub integration
3. ✅ Add secrets to GitHub
4. ✅ Push to `main` (triggers auto-deploy)
5. ✅ Connect custom domain
6. ✅ Customize content
7. ✅ Monitor analytics in Cloudflare

## Links

- **Brochure live**: `https://brochure.example.com`
- **Cloudflare Pages docs**: https://developers.cloudflare.com/pages/
- **Vite docs**: https://vitejs.dev
- **React docs**: https://react.dev

---

**Questions?** Check GitHub Actions logs or Cloudflare dashboard for detailed error messages.
