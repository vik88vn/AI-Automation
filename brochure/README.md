# AI QA Engineer – Marketing Brochure

A modern, responsive landing page showcasing the AI QA Engineer product. Built with React, TypeScript, and Vite.

## Features

- **Hero Section** – Eye-catching headline and value proposition
- **Feature Cards** – 8+ bug detectors explained with icons
- **How It Works** – 4-step process visualization
- **Capabilities** – Technical features and benefits
- **Pricing** – Three-tier pricing model
- **Call-to-Action** – Drive signups and engagement
- **Footer** – Links and social media
- **Responsive Design** – Works on mobile, tablet, desktop

## Local Development

```bash
cd brochure
npm install
npm run dev
```

Server runs at `http://localhost:5174`

## Build for Production

```bash
npm run build
```

Output: `dist/` folder ready for deployment

## Deployment Options

### Cloudflare Pages

1. Create a new Cloudflare Pages project
2. Connect your GitHub repo
3. Set build command: `npm run build`
4. Set output directory: `dist`
5. Deploy

### Other Platforms

The `dist` folder is a static site – deploy to:
- Netlify
- Vercel
- AWS S3 + CloudFront
- Any static hosting

## Customize

### Change Colors

Edit `src/index.css` – update gradient colors:
- Primary: `from-blue-500 to-purple-500`
- Accent colors in badge, buttons, etc.

### Update Content

- `src/components/Hero.tsx` – Hero text and buttons
- `src/components/Features.tsx` – Feature list
- `src/components/Pricing.tsx` – Pricing tiers
- `src/components/Footer.tsx` – Footer links

### Add Pages

Create new component in `src/components/`, import in `src/App.tsx`

## Tech Stack

- **React 18** – UI framework
- **TypeScript** – Type safety
- **Vite** – Build tool
- **Lucide React** – Icons

## Architecture

```
brochure/
├── src/
│   ├── components/
│   │   ├── Nav.tsx          # Navigation bar
│   │   ├── Hero.tsx         # Hero section
│   │   ├── Features.tsx      # Feature cards
│   │   ├── HowItWorks.tsx    # Process steps
│   │   ├── Capabilities.tsx  # Tech capabilities
│   │   ├── Pricing.tsx       # Pricing plans
│   │   ├── CTA.tsx           # Call-to-action
│   │   └── Footer.tsx        # Footer
│   ├── App.tsx              # Main app
│   ├── main.tsx             # Entry point
│   ├── index.css            # Global styles
│   └── vite-env.d.ts        # Type definitions
├── index.html               # HTML template
├── vite.config.ts           # Vite config
├── tsconfig.json            # TypeScript config
└── package.json             # Dependencies
```

## Performance

- Zero external CSS dependencies (custom CSS)
- Minimal JavaScript (React + Lucide only)
- Fast load times
- SEO-friendly semantic HTML

## License

MIT
