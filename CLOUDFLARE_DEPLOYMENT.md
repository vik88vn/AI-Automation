# Cloudflare Deployment Guide for AI QA Engineer

This guide covers deploying the AI QA Engineer as a SaaS product on Cloudflare Pages (frontend) + a traditional server (backend).

---

## Architecture Overview

```
┌──────────────────────────────────────┐
│   Cloudflare Pages                   │
│   (React frontend - static files)    │
│   https://example.com                │
└──────────────┬───────────────────────┘
               │ /api/* requests
               │ (CORS fetch)
               ▼
┌──────────────────────────────────────┐
│   Backend Server (Railway/Render)    │
│   (Node.js + Playwright)             │
│   https://api.example.com            │
└──────────────────────────────────────┘
```

---

## Phase 1: Deploy Frontend to Cloudflare Pages

### Prerequisites

1. **Cloudflare Account**: https://dash.cloudflare.com/
2. **Domain**: Set as nameservers to Cloudflare
3. **Wrangler CLI**: `npm install -g wrangler`
4. **Git repository**: Already using GitHub

### Step-by-Step Deployment

#### Option A: Via Git (Recommended)

1. **Connect GitHub to Cloudflare Pages**:
   ```bash
   # 1. Go to https://dash.cloudflare.com/ → Pages
   # 2. Click "Create a project" → "Connect to Git"
   # 3. Select your GitHub account and the AI-QA-Engineer repo
   # 4. Configure build settings:
   #    - Project name: ai-qa-engineer-frontend
   #    - Framework: Vite (React)
   #    - Build command: cd frontend && npm run build
   #    - Build output directory: frontend/dist
   #    - Root directory: (leave blank or use ".")
   ```

2. **Set Environment Variables** in Cloudflare dashboard:
   ```
   # In Pages → Project Settings → Environment variables
   
   Production:
     VITE_API_TARGET = https://api.example.com
   
   Preview/Staging:
     VITE_API_TARGET = https://staging-api.example.com
   ```

3. **Deploy**:
   - Push to `main` branch on GitHub
   - Cloudflare automatically builds and deploys
   - Watch build logs at https://dash.cloudflare.com/

#### Option B: Via Wrangler CLI (Manual)

1. **Build the frontend**:
   ```bash
   cd frontend
   npm install
   npm run build
   ```

2. **Deploy to Cloudflare Pages**:
   ```bash
   cd ..
   npx wrangler pages deploy frontend/dist \
     --project-name=ai-qa-engineer-frontend \
     --branch=main
   ```

3. **Set environment variables**:
   ```bash
   wrangler pages project create ai-qa-engineer-frontend
   wrangler secret put VITE_API_TARGET --env production
   # Then enter: https://api.example.com
   ```

### Verification

1. Visit: `https://your-domain.com`
2. You should see the React dashboard
3. Check browser console for any API errors (should see CORS errors initially since backend isn't deployed yet)
4. Frontend is now live on Cloudflare!

---

## Phase 2: Deploy Backend to Traditional Server

### Infrastructure Choices

Choose one of these for the backend (where long-running Playwright automation happens):

#### Railway (Recommended for MVP)

1. **Sign up**: https://railway.app
2. **Connect GitHub**: Railway → GitHub → Authorize
3. **Create new project**: Select your AI-QA-Engineer repo
4. **Service settings**:
   - **Start command**: `npm run install-browsers && npm run agent:serve`
   - **Node version**: 20.x
   - **Environment variables**:
     ```
     AGENT_PORT=8000
     ANTHROPIC_API_KEY=sk-ant-...  (get from Anthropic dashboard)
     DATABASE_URL=postgresql://...  (Railway auto-provisions PostgreSQL)
     JWT_SECRET=your-secret-key-here
     R2_BUCKET_NAME=ai-qa-reports
     R2_ACCOUNT_ID=your-account-id
     R2_ACCESS_KEY_ID=your-key-id
     R2_SECRET_ACCESS_KEY=your-secret
     ```
5. **Deploy**: Git push → Railway auto-builds and deploys
6. **Custom domain**: Railway → Project → Settings → Custom domain
   - Point your `api.example.com` subdomain here

#### Render (Free tier available)

1. **Sign up**: https://render.com
2. **New Web Service**: GitHub → Select repo
3. **Settings**:
   - **Build command**: `npm install && npm run install-browsers`
   - **Start command**: `npm run agent:serve`
   - **Environment**:
     ```
     AGENT_PORT=8000
     ANTHROPIC_API_KEY=sk-ant-...
     DATABASE_URL=postgresql://...  (Render includes free PostgreSQL)
     NODE_ENV=production
     ```
4. **Custom domain**: Point `api.example.com` to Render's assigned URL

#### Other Options

- **Fly.io**: `flyctl launch` → configure fly.toml
- **AWS EC2**: Manual setup, more control, requires DevOps
- **DigitalOcean App Platform**: Similar to Railway/Render

### Backend Setup Steps (Railway Example)

1. **Provision PostgreSQL database**:
   - Railway auto-creates PostgreSQL when you add a PostgreSQL service
   - Copy DATABASE_URL to environment variables

2. **Add Cloudflare R2 bucket** (for reports storage):
   - Go to https://dash.cloudflare.com/ → R2
   - Create new bucket: `ai-qa-reports`
   - Create API token with R2 permissions
   - Add R2 env vars to Railway

3. **Deploy**:
   ```bash
   git push  # Railway auto-deploys on push
   ```

4. **Verify backend**:
   ```bash
   curl https://api.example.com/health
   # Should return: {"status": "ok", "provider": "openai"}
   ```

### Environment Variables Checklist

```bash
# Backend environment variables (set in Railway/Render dashboard)

# Server config
AGENT_PORT=8000                                    # Don't expose port 4310
NODE_ENV=production

# LLM Provider (choose one)
ANTHROPIC_API_KEY=sk-ant-...                      # OR
OPENAI_API_KEY=sk-...                             # OR
OLLAMA_BASE_URL=http://ollama:11434               # If self-hosting

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Authentication
JWT_SECRET=generate-a-random-secret-key-here      # Use: openssl rand -hex 32

# File Storage (Cloudflare R2)
R2_BUCKET_NAME=ai-qa-reports
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-api-token-id
R2_SECRET_ACCESS_KEY=your-r2-api-token-secret
R2_ENDPOINT=https://your-account.r2.cloudflarestorage.com

# CORS (frontend domain)
CORS_ORIGIN=https://example.com

# Optional: GitHub integration for fix agent
GITHUB_TOKEN=ghp_...  # For cloning user repos
```

---

## Phase 3: Wire Frontend to Backend

Once both are deployed, the frontend needs to know where the backend is.

### Update API Target

The frontend was built with `VITE_API_TARGET=https://api.example.com`. This means:
- All `/api/*` requests go to `https://api.example.com/api/*`
- This works cross-origin (browser CORS)

### Test the Connection

1. Open https://example.com
2. Open browser DevTools → Network
3. Click "Start" → enter target URL
4. Should see `/api/runs` request go to `https://api.example.com/api/runs`
5. If 200 OK: ✅ Backend is reachable
6. If 403/401: ✅ Backend is reachable but auth required (expected for API calls without JWT)
7. If failed DNS: ❌ Backend domain not set up correctly

---

## Phase 4: Add Cloudflare Workers for API Gateway (Optional)

For production SaaS, add a Cloudflare Worker to:
- Validate JWT tokens at the edge
- Rate limit per user
- Cache responses
- Log analytics

### Workers Setup

1. **Create worker**:
   ```bash
   wrangler generate api-gateway
   cd api-gateway
   ```

2. **src/index.ts**:
   ```typescript
   import { Router } from 'itty-router';
   
   const router = Router();
   
   router.all('/api/*', async (req) => {
     // Validate JWT
     const authHeader = req.headers.get('authorization');
     const token = authHeader?.split(' ')[1];
     if (!token) {
       return new Response('Unauthorized', { status: 401 });
     }
     
     // Forward to backend
     const backendUrl = 'https://api.example.com' + new URL(req.url).pathname;
     return fetch(backendUrl, {
       method: req.method,
       headers: req.headers,
       body: req.body,
     });
   });
   
   router.all('*', () => new Response('Not found', { status: 404 }));
   
   export default { fetch: router.handle };
   ```

3. **Deploy**:
   ```bash
   wrangler publish
   ```

4. **Configure route**:
   - In Cloudflare dashboard → Workers & Pages
   - Add route: `api.example.com/api/*` → Your worker

---

## Monitoring & Logs

### Cloudflare Pages (Frontend)

- **Logs**: https://dash.cloudflare.com/ → Pages → Your project → Real-time logs
- **Analytics**: Pages → Analytics tab shows traffic, errors

### Railway (Backend)

- **Logs**: Railway dashboard → Your service → Logs tab
- **Metrics**: Deployments tab shows CPU, memory, network
- **Alerts**: Set up in Railway dashboard

---

## Troubleshooting

### CORS Errors

**Problem**: Browser shows `Access to XMLHttpRequest blocked by CORS policy`

**Solution**:
1. Check backend has CORS enabled: `src/agent/server.ts` line 30+
2. Verify `CORS_ORIGIN` env var matches frontend domain
3. Add to backend:
   ```javascript
   res.setHeader("access-control-allow-origin", process.env.CORS_ORIGIN || "*");
   res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
   res.setHeader("access-control-allow-headers", "content-type, authorization");
   ```

### API Endpoint Returns 404

**Problem**: Frontend can reach backend but `/api/runs` returns 404

**Solution**:
1. Check backend started: `curl https://api.example.com/health`
2. Check `AGENT_PORT` is correct in backend
3. Check service actually started (check Railway/Render logs)
4. Verify backend isn't on old code (force redeploy)

### Database Connection Error

**Problem**: Backend logs show `Error: connect ECONNREFUSED database`

**Solution**:
1. Check `DATABASE_URL` is correct: `postgresql://user:pass@host:port/db`
2. Verify PostgreSQL service is running (Railway: add PostgreSQL service)
3. Run migrations: `npm run db:migrate` (if migrations exist)

### Playwright Crashes

**Problem**: Agent runs fail with `Error: chromium not found`

**Solution**:
1. Ensure `npm run install-browsers` runs before start
2. Check Docker/container has enough disk space (~500MB for Chromium)
3. Set `headless=true` to avoid UI rendering

---

## DNS & Domain Setup

### Cloudflare DNS Records

Add these to your Cloudflare domain (https://dash.cloudflare.com/ → DNS):

```
Type   Name        Value                    Proxy
CNAME  example.com your-pages-domain        Proxied (orange cloud)
CNAME  api         railway-app-url.railway  Proxied (orange cloud)
```

After 5-10 minutes, both should be live:
- `https://example.com` → Frontend (Cloudflare Pages)
- `https://api.example.com` → Backend (Railway)

---

## Cost Estimate (Monthly)

| Service | Cost | Notes |
|---------|------|-------|
| Cloudflare Pages | Free | Unlimited requests, global CDN |
| Railway (backend) | $10-30 | ~$0.30/GB RAM/hr, includes PostgreSQL |
| Cloudflare R2 | Free tier + $0.015/GB | 10GB free/month, then pay for storage |
| **Total** | **$10-40/mo** | Very affordable for small SaaS |

---

## Next Steps

1. ✅ Deploy frontend to Cloudflare Pages
2. ✅ Deploy backend to Railway with PostgreSQL
3. ⏳ Add user authentication (JWT) — see `PHASE_2_AUTH.md`
4. ⏳ Add multi-tenancy database tables — see `PHASE_3_MULTI_TENANT.md`
5. ⏳ Migrate fix agent to ZIP uploads — see `PHASE_4_FIX_AGENT.md`
6. ⏳ Add CI/CD pipeline — see `PHASE_5_CICD.md`

---

## Support

For issues:
1. Check Cloudflare status: https://www.cloudflarestatus.com/
2. Check Railway status: https://status.railway.app/
3. Read backend logs: Railway dashboard → Logs
4. Read frontend errors: Browser DevTools → Console
5. Test API directly: `curl -v https://api.example.com/health`
