# GitHub + Render Auto-Deployment Setup Guide

This guide walks you through connecting your GitHub repository to Render so that every `git push` automatically rebuilds and restarts your backend (including the new `/resend` email route).

---

## Step 1: Push Code to GitHub

```bash
# Initialize Git repo (if not already done)
cd /path/to/your/project
git init
git add .
git commit -m "Initial commit with user creation + email delivery"

# Create GitHub repo (via web or gh CLI)
# Then push:
git remote add origin https://github.com/YOUR_USERNAME/healthtrack.git
git branch -M main
git push -u origin main
```

---

## Step 2: Connect Render to GitHub (One-Time Setup)

### Option A: Blueprint Deploy (Recommended — reads render.yaml)

1. Go to https://dashboard.render.com/blueprints
2. Click **New Blueprint Instance**
3. Connect your GitHub account and select the repo
4. Render reads `render.yaml` and creates the service automatically
5. Name: `healthtrack-api`
6. Click **Apply**

### Option B: Manual Web Service Setup

1. Go to https://dashboard.render.com
2. Click **New** → **Web Service**
3. Connect your GitHub repo
4. Configure:
   - **Name**: `healthtrack-api`
   - **Runtime**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Starter (or Free)
5. Click **Create Web Service**

---

## Step 3: Set Environment Variables on Render

In your Render service dashboard → **Environment** tab, add these secrets:

| Key | Value | Required |
|-----|-------|----------|
| `MONGODB_URI` | Your MongoDB connection string | YES |
| `JWT_SECRET` | A long random string for JWT signing | YES |
| `SMTP_PASS` | Your Gmail app password (no spaces) | YES |
| `AFRICASTALKING_API_KEY` | Africa's Talking API key | For SMS |
| `VAPID_PUBLIC_KEY` | Web Push VAPID public key | For push notifications |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key | For push notifications |
| `SESSION_SECRET` | Random string for session encryption | YES |

**Important:** The `SMTP_PASS` should be your Gmail app password WITHOUT spaces:
- If your app password is `ubyi sesm vhsx aopv` → enter as `ubyisesmvhsxaopv`

---

## Step 4: Enable Auto-Deploy

1. In Render dashboard → your service → **Settings**
2. Under **Deploy**, set **Auto-Deploy** to **Yes**
3. Click **Save Changes**

Now every `git push` to `main` will automatically:
- Build the frontend (`vite build`)
- Build the backend (`tsc` compile)
- Restart the server with new code
- The `/resend` route and all new features will be live within 2-3 minutes

---

## Step 5: Set Up GitHub Actions (Optional — for deploy notifications)

1. In your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Add a new secret:
   - **Name**: `RENDER_DEPLOY_HOOK_URL`
   - **Value**: Get this from Render dashboard → your service → **Settings** → **Deploy Hook** → copy the URL
3. The `.github/workflows/deploy.yml` is already in the repo — it will trigger on every push

---

## How It Works

```
You push code to GitHub (git push origin main)
    ↓
Render detects the push (auto-deploy enabled)
    ↓
Render runs: npm install && npm run build
    ↓
Frontend builds to dist/ (Vite)
Backend compiles to dist/server/ (TypeScript)
    ↓
Render runs: npm start
    ↓
Express server starts on port 3000
Serves API at /api/v1/*
Serves frontend at /* (SPA fallback to index.html)
    ↓
Backend is live with all new routes including /resend
```

---

## What Changed in the Code

| File | Change |
|------|--------|
| `src/server/index.ts` | Express now serves `dist/` static files + SPA fallback |
| `src/lib/config.ts` | `API_BASE_URL` uses relative URLs when on same domain |
| `render.yaml` | Blueprint config with autoDeploy: true |
| `package.json` | Added `build` script (vite + server), `start` uses compiled JS |
| `.github/workflows/deploy.yml` | GitHub Actions to trigger Render deploy |

---

## Troubleshooting

### "The requested resource was not found" when resending email

**Cause:** Backend is still running old code without the `/resend` route.

**Fix:** Check that auto-deploy worked:
1. Go to Render dashboard → your service → **Events**
2. Look for the latest deploy event
3. If it shows old commit hash, manually deploy:
   - **Manual Deploy** → **Deploy latest commit**

### Emails still not sending

**Check SMTP password:**
1. In Render dashboard → Environment, verify `SMTP_PASS` has NO spaces
2. Verify `SMTP_USER` is `bkitib@gmail.com`
3. Check Render logs for `[Email]` messages

### Frontend shows blank page on Render URL

**Cause:** The `dist/` folder might not be built.

**Fix:** Check Render build logs for Vite build output. If missing:
```bash
# In Render dashboard → Shell
npm run build
```
