# 🚀 Vercel Deployment Guide

This guide will help you deploy PashuVision to Vercel.

## Prerequisites

1. GitHub account with the repository: `bhataakib02/-PashuVision`
2. Vercel account (free tier works)
3. Supabase account (for database)

## Deployment Steps

### 1. Connect Repository to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/new)
2. Click **"Import Project"**
3. Select **"Import Git Repository"**
4. Choose `bhataakib02/-PashuVision`
5. Select the `main` branch

### 2. Configure Project Settings

In the Vercel project configuration page:

- **Framework Preset**: `Other`
- **Root Directory**: `./` (default)
- **Build Command**: `cd frontend && npm install && npm run build`
- **Output Directory**: `frontend/dist`
- **Install Command**: `npm install && cd backend && npm install && cd ../frontend && npm install`

### 3. Environment Variables

Add these environment variables in Vercel Dashboard → Project → Settings → Environment Variables:

#### Required Variables:

```env
# JWT Secret (generate a random string)
JWT_SECRET=your-super-secret-jwt-key-change-this

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Database Flag
USE_SUPABASE=true

# Port (Vercel will handle this automatically, but include for safety)
PORT=4000

# Node Environment
NODE_ENV=production
```

#### Optional Variables:

```env
# Python Service URL (if using separate PyTorch service)
PYTORCH_SERVICE_URL=http://your-pytorch-service-url:5000

# Email Service (if using)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Twilio (if using SMS)
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=your-phone-number
```

### 4. Important Notes

#### ⚠️ PyTorch Model Service

The PyTorch model (`pytorch_service.py`) **cannot run directly on Vercel** because:
- Vercel serverless functions have size limits
- PyTorch requires specific system dependencies
- Vercel functions are stateless and short-lived

**Solution: Deploy Python Service Separately**

The Python prediction service must be deployed separately. **See [DEPLOY_PYTHON_SERVICE.md](./DEPLOY_PYTHON_SERVICE.md) for complete instructions.**

**Quick Setup:**
1. Deploy Python service to Railway, Render, or Heroku
2. Copy the service URL (e.g., `https://your-service.up.railway.app`)
3. In Vercel project settings, add environment variable:
   - Key: `PYTORCH_SERVICE_URL`
   - Value: Your service URL
4. Redeploy Vercel application

**Without Python Service:**
- Breed prediction features will show 503 errors
- Other features (user management, records, etc.) will work normally

#### 📝 Model Files

Large model files (`.pth`, `.onnx`) are excluded from Git by default. If you need them:
1. Use Git LFS (Git Large File Storage)
2. Or host models separately and reference via URL

### 5. Deploy

1. Click **"Deploy"** button
2. Wait for build to complete (usually 2-5 minutes)
3. Your app will be live at: `https://pashu-vision.vercel.app` (or your custom domain)

### 6. Post-Deployment Checklist

- [ ] Verify frontend loads correctly
- [ ] Test API endpoints (`/api/auth/login`, etc.)
- [ ] Verify environment variables are set
- [ ] Check Supabase connection
- [ ] Test user registration/login
- [ ] Verify file uploads work (if applicable)

## Troubleshooting

### Build Fails

**Error: "Module not found"**
- Ensure all dependencies are in `package.json`
- Check that `installCommand` installs all dependencies

**Error: "Build command failed"**
- Verify Node.js version (should be 18+)
- Check build logs for specific errors

### Runtime Errors

**Error: "Database connection failed"**
- Verify Supabase credentials
- Check Supabase project is active
- Verify RLS policies are set correctly

**Error: "API routes not working"**
- Verify `api/index.js` exists
- Check function configuration in `vercel.json`
- Verify rewrites are configured correctly

### Function Timeout

If API requests timeout:
- Increase `maxDuration` in `vercel.json` (Hobby plan: max 60s)
- Consider optimizing long-running operations
- Move heavy processing to background jobs

## Custom Domain

1. Go to Project Settings → Domains
2. Add your custom domain
3. Follow DNS configuration instructions
4. Wait for SSL certificate (automatic)

## Continuous Deployment

Vercel automatically deploys:
- Every push to `main` branch → Production
- Pull requests → Preview deployments

## Need Help?

- Check [Vercel Documentation](https://vercel.com/docs)
- Review deployment logs in Vercel Dashboard
- Check Supabase logs for database issues

---

**Happy Deploying! 🎉**

