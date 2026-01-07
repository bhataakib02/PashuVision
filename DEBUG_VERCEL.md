# 🔍 Debugging Vercel 500 Errors

## Current Issue
The serverless function is crashing with `FUNCTION_INVOCATION_FAILED` error.

## Steps to Debug

### 1. Check Vercel Logs
1. Go to: https://vercel.com/dashboard
2. Click on your project: **pashu-vision**
3. Click **Logs** tab
4. Look for the debug messages we added:
   - `🔍 Checking environment variables:`
   - Which variables show `✓ Set` vs `✗ Missing`

### 2. Verify Environment Variables for ALL Environments

**Important:** Environment variables must be set for **Production, Preview, AND Development**

1. Go to: Vercel Dashboard → Your Project → **Settings** → **Environment Variables**
2. For EACH variable, click the **⋮** (three dots) → **Edit**
3. Make sure these checkboxes are ALL checked:
   - ☑ Production
   - ☑ Preview
   - ☑ Development

### 3. Check the Actual Error in Logs

Look for these in the logs:
- `❌ Error loading server:` - Shows what failed during server initialization
- `❌ Failed to initialize DatabaseService:` - Shows database connection issues
- Any stack traces showing the exact error

## Common Issues and Fixes

### Issue 1: Environment Variables Not Set for Preview
**Symptom:** Works in production but not in preview deployments
**Fix:** Edit each environment variable and ensure "Preview" is checked

### Issue 2: DatabaseService Throwing Error
**Symptom:** Logs show "Supabase credentials are required"
**Fix:** 
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
- Make sure they're set for all environments

### Issue 3: Module Loading Error
**Symptom:** Logs show import/require errors
**Fix:** Check if optional dependencies are causing issues

## Next Steps

1. **Check the logs** using steps above
2. **Share the error message** from the logs
3. **Verify environment variables** are set for Preview environment
4. **Redeploy** after making changes

## Quick Test

After fixing, test these endpoints:
- `https://pashu-vision.vercel.app/api/test` - Should return `{"message":"Server is working!"}`
- `https://pashu-vision.vercel.app/api/auth/login` - Should handle POST requests

