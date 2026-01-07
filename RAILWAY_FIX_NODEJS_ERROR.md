# Fix Railway Node.js Detection Error

## Problem
Railway is detecting your repository as a Node.js project and trying to run `npm run build`, which fails because:
- You want to deploy the Python service, not Node.js
- The frontend build requires specific Node.js version
- Railway is looking at the root directory instead of `backend/models`

## Solution: Configure Railway Correctly

### Step 1: Delete and Recreate Service

1. In Railway dashboard, click on your service
2. Go to **"Settings"** tab
3. Scroll to bottom → Click **"Delete Service"**
4. Confirm deletion

### Step 2: Create New Service (Python Service)

1. In your Railway project, click **"+ New"** button
2. Select **"GitHub Repo"** again
3. Select your repository: `-PashuVision`

### Step 3: Configure as Python Service

**IMPORTANT:** Before Railway starts building, go to Settings immediately:

1. Click on the newly created service
2. Go to **"Settings"** tab immediately (before build starts)

3. **Set Root Directory:**
   - Scroll to "Root Directory"
   - Set to: `backend/models`
   - This is CRITICAL - it tells Railway to use Python, not Node.js

4. **Set Start Command:**
   - Scroll to "Start Command"
   - Set to: `python pytorch_service.py`

5. **Verify Build Settings:**
   - Make sure "Build Command" is empty or `pip install -r requirements.txt`
   - Should NOT contain any `npm` commands

6. **Save Settings**

### Step 4: Trigger Manual Deploy

1. Go to **"Deployments"** tab
2. Click **"..."** (three dots) on the latest deployment
3. Click **"Redeploy"**
4. This should now build as Python service, not Node.js

## Alternative: Use Railway CLI (More Control)

If web interface keeps detecting Node.js:

1. **Install Railway CLI:**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login:**
   ```bash
   railway login
   ```

3. **Link Project:**
   ```bash
   railway link
   ```

4. **Set Root Directory:**
   ```bash
   railway variables set RAILWAY_ROOT_DIRECTORY=backend/models
   ```

5. **Set Start Command:**
   ```bash
   railway variables set RAILWAY_START_COMMAND="python pytorch_service.py"
   ```

6. **Deploy:**
   ```bash
   railway up
   ```

## Verify It's Working

After redeploy, check the build logs:

✅ **Good signs:**
- `Using Nixpacks` shows Python packages
- `pip install -r requirements.txt` running
- `python pytorch_service.py` starting

❌ **Bad signs:**
- `npm install` or `npm run build` commands
- Node.js version errors
- Frontend build attempts

## Still Having Issues?

If Railway still detects Node.js:

1. Create `backend/models/.railwayignore` file:
   ```
   ../../
   ../../frontend/
   ../../backend/src/
   ```

2. Create `backend/models/railway.json`:
   ```json
   {
     "build": {
       "builder": "NIXPACKS",
       "buildCommand": "pip install -r requirements.txt"
     },
     "deploy": {
       "startCommand": "python pytorch_service.py",
       "restartPolicyType": "ON_FAILURE"
     }
   }
   ```

3. Commit and push:
   ```bash
   git add backend/models/.railwayignore backend/models/railway.json
   git commit -m "Add Railway config for Python service"
   git push origin main
   ```

4. Railway will auto-deploy with correct settings

