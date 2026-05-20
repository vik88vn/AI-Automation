# Phase 1: Deploy Frontend to Cloudflare Pages

Quick-start guide for deploying the React frontend to Cloudflare Pages.

## Prerequisites

✅ Cloudflare account (https://dash.cloudflare.com)  
✅ Domain set as nameservers to Cloudflare  
✅ GitHub account with your repo forked/cloned  
✅ `wrangler` CLI installed: `npm install -g wrangler`

## Option 1: Automatic Deployment via GitHub (Recommended)

### 1. Connect GitHub to Cloudflare

1. Go to https://dash.cloudflare.com/ → **Pages**
2. Click **"Create application"** → **"Connect to Git"**
3. Select **GitHub** and authorize Cloudflare
4. Choose the **AI-Automation-QA-Engineer** repository
5. Click **"Begin setup"**

### 2. Configure Build Settings

In the build configuration screen:

| Field | Value |
|-------|-------|
| **Framework** | Vite (React) |
| **Build command** | `cd frontend && npm run build` |
| **Build output directory** | `frontend/dist` |
| **Root directory** | (leave blank) |
| **Node version** | 20.x |

Click **"Save and deploy"**

### 3. Set Environment Variables

Once the build fails (expected, no env vars yet):

1. Go to **Pages** → Your project → **Settings** → **Environment variables**
2. Click **"Edit variables"** → **"Add variable"**

**For Production**:
- **Name**: `VITE_API_TARGET`
- **Value**: `https://api.example.com`  
  (Replace with your actual backend domain)
- **Environments**: Production

3. Click **"Save and deploy"** (Cloudflare re-triggers build)
4. Wait for build to complete ✅

### 4. Verify Deployment

1. Your Pages URL appears in Cloudflare dashboard (something like `https://ai-qa-engineer.pages.dev`)
2. Visit the URL in your browser
3. You should see the React dashboard with the QA Engineer UI
4. (Ignore API errors for now — backend not deployed yet)

---

## Option 2: Manual Deployment via Wrangler CLI

### 1. Build Frontend

```bash
cd /Users/rohailsiddiqi/Documents/ai-qa-engineer/frontend
npm install
npm run build
```

Output goes to: `frontend/dist/`

### 2. Deploy to Cloudflare Pages

```bash
cd /Users/rohailsiddiqi/Documents/ai-qa-engineer

wrangler pages deploy frontend/dist \
  --project-name ai-qa-engineer-frontend \
  --branch production
```

### 3. Authenticate with Cloudflare

If prompted to log in:
```bash
wrangler login
```

Then re-run the deploy command.

### 4. Set Environment Variable

```bash
wrangler pages secret set VITE_API_TARGET \
  --project-name ai-qa-engineer-frontend \
  --env production
```

When prompted, enter: `https://api.example.com` (your backend domain)

### 5. Verify

Visit the Cloudflare Pages URL (shown in terminal output) ✅

---

## Custom Domain Setup

Once frontend is deployed, point your domain to Cloudflare Pages:

### If your domain is already on Cloudflare:

1. Go to **Pages** → Your project → **Custom domains**
2. Click **"Set up a custom domain"**
3. Enter your domain: `example.com`
4. Cloudflare automatically creates the DNS CNAME record
5. Wait for DNS propagation (usually 5-10 minutes)
6. Visit `https://example.com` ✅

### If your domain is NOT on Cloudflare:

1. Update your domain's nameservers to point to Cloudflare:
   - ns1.cloudflare.com
   - ns2.cloudflare.com  
   - ns3.cloudflare.com
   - ns4.cloudflare.com
2. Wait 24 hours for propagation
3. Add domain to Cloudflare dashboard → follow custom domain steps above

---

## Debugging

### Build Failed

**Check logs in Cloudflare Pages dashboard:**

1. Go to **Pages** → Your project → **Deployments**
2. Click the failed deployment
3. Scroll to **Build logs** and look for errors

**Common errors:**

- `npm: command not found` → Node.js version issue. Set Node version in build settings.
- `vite: not found` → Missing `npm install`. Check frontend/package.json is correct.
- `VITE_API_TARGET not defined` → Env var not set. Add it in Pages settings.

### Frontend Shows But API Calls Fail

This is **expected** if the backend isn't deployed yet.

Once backend is live on `https://api.example.com`, API calls should work.

**Test in browser console:**

```javascript
fetch('https://api.example.com/health')
  .then(r => r.json())
  .then(d => console.log(d))
  .catch(e => console.error(e))
```

Should return: `{ status: "ok", provider: "..." }`

---

## Next Steps

✅ Frontend is now live on Cloudflare Pages  
⏳ Phase 2: Deploy backend to Railway  
⏳ Phase 3: Add authentication  
⏳ Phase 4: Add multi-tenancy  

→ See [CLOUDFLARE_DEPLOYMENT.md](./CLOUDFLARE_DEPLOYMENT.md) for Phase 2 backend setup.
