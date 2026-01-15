# Vercel + Railway Setup Guide

## Problem
The Vercel backend needs to connect to the Railway Python service for AI predictions. Without the `PYTORCH_SERVICE_URL` environment variable set, predictions will fail with 503 errors.

## Solution: Configure Environment Variables

### Step 1: Get Your Railway Service URL

1. Go to your Railway project dashboard
2. Click on your Python service (PashuVision)
3. Go to the **Settings** tab
4. Find the **Public Domain** or **Custom Domain** section
5. Copy the public URL (e.g., `https://pashuvision-production.up.railway.app`)

**OR** if you have a custom domain set up, use that instead.

### Step 2: Set Environment Variable in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add a new environment variable:
   - **Name**: `PYTORCH_SERVICE_URL`
   - **Value**: Your Railway service URL (e.g., `https://pashuvision-production.up.railway.app`)
   - **Environment**: Select all (Production, Preview, Development)
4. Click **Save**

### Step 3: Redeploy Vercel

After setting the environment variable:

1. Go to **Deployments** tab in Vercel
2. Click the **⋯** menu on the latest deployment
3. Select **Redeploy**
4. Or push a new commit to trigger automatic deployment

## Verification

After redeploying, check the Vercel function logs. You should see:

```
✅ Using Python PyTorch service for predictions
   Service URL: https://your-railway-url.up.railway.app
   Model loaded: true/false
```

## Troubleshooting

### Error: "Python service at [URL] is not available"

**Possible causes:**
1. Railway service is not running - Check Railway dashboard
2. Wrong URL - Verify the Railway public domain
3. CORS issues - Railway service should allow CORS (already configured)
4. Model still loading - Wait 30-60 seconds and retry

### Error: "Model is still loading"

This is normal on the **first request** after deployment:
- The model loads lazily (on first request)
- Wait 30-60 seconds
- Retry the prediction request
- Subsequent requests will be fast

### Check Railway Service Health

1. Open your Railway service URL in a browser: `https://your-service.up.railway.app/health`
2. You should see:
   ```json
   {
     "status": "ok",
     "service": "running",
     "model_loaded": true/false,
     "model_loading": false
   }
   ```

## Environment Variables Summary

### Required in Vercel:
- `PYTORCH_SERVICE_URL` - Railway Python service URL
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `JWT_SECRET` - Secret for JWT tokens

### Optional:
- `USE_SUPABASE` - Set to `true` (default)

## Quick Setup Script

If you have the Railway URL, you can set it via Vercel CLI:

```bash
# Install Vercel CLI if not installed
npm i -g vercel

# Set the environment variable
vercel env add PYTORCH_SERVICE_URL

# When prompted, enter your Railway URL
# Select environments: Production, Preview, Development
```

## Architecture

```
┌─────────────┐         HTTP Request         ┌──────────────┐
│   Vercel    │ ──────────────────────────> │   Railway    │
│  (Backend)  │                               │ (Python AI)  │
│             │ <──────────────────────────── │              │
└─────────────┘      JSON Predictions        └──────────────┘
```

- **Vercel**: Hosts Node.js backend API
- **Railway**: Hosts Python PyTorch service with AI model
- **Communication**: HTTP REST API calls

---

**Status**: ✅ Setup guide created
**Last Updated**: 2026-01-15

