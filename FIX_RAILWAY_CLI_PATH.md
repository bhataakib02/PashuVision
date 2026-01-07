# Fix Railway CLI PATH Issue

## Problem
Railway CLI is installed but PowerShell can't find it. This is a PATH issue.

## Quick Fix: Add npm global bin to PATH

### Option 1: Use Full Path (Quick Test)

Try running Railway CLI using the full path:

```powershell
# Find where npm installs global packages
npm config get prefix

# Then try:
& "$(npm config get prefix)\railway.cmd" --version
```

### Option 2: Add to PATH Permanently

1. **Get npm global path:**
   ```powershell
   npm config get prefix
   ```
   Note the path (usually `C:\Users\YourName\AppData\Roaming\npm`)

2. **Add to PATH:**
   - Press `Win + R`
   - Type: `sysdm.cpl` and press Enter
   - Click "Environment Variables"
   - Under "User variables", find "Path"
   - Click "Edit"
   - Click "New"
   - Add the path from step 1 (e.g., `C:\Users\bhata\AppData\Roaming\npm`)
   - Click OK on all dialogs

3. **Restart PowerShell** (close and reopen)

4. **Test:**
   ```powershell
   railway --version
   ```

### Option 3: Use npx (No PATH needed)

You can use `npx` to run Railway CLI without adding to PATH:

```powershell
# Login
npx @railway/cli login

# Link
npx @railway/cli link

# Set variables
npx @railway/cli variables set RAILWAY_ROOT_DIRECTORY=backend/models
npx @railway/cli variables set RAILWAY_START_COMMAND="python pytorch_service.py"

# Verify
npx @railway/cli variables

# Deploy
npx @railway/cli up
```

### Option 4: Use Railway Web Interface

Since CLI PATH is problematic, you can also configure via web:

1. Go to Railway dashboard
2. Click your service → **Settings** tab
3. Look for **"Variables"** section
4. Add these manually:
   - `RAILWAY_ROOT_DIRECTORY` = `backend/models`
   - `RAILWAY_START_COMMAND` = `python pytorch_service.py`
5. Save and redeploy

---

## Recommended: Use npx (Option 3)

This is the easiest - no PATH configuration needed!

