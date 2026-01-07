# Deploying Python Prediction Service

The PyTorch prediction service **cannot run on Vercel** because it requires:
- Long-running processes (Vercel is serverless)
- Large dependencies (PyTorch, torchvision, etc.)
- GPU/CPU-intensive operations

## Solution: Deploy Python Service Separately

You have two options:

### Option 1: Deploy to Railway (Recommended - Easy Setup)

#### Step 1: Create Railway Account and Workspace

1. **Sign up for Railway**
   - Go to [railway.app](https://railway.app)
   - Click "Start a New Project" or "Login"
   - Sign up using your GitHub account (recommended)

2. **Create a Workspace** (IMPORTANT - Fixes the workspaceId error)
   - After signing up, you'll be asked to create a workspace
   - Click "New Workspace" or "Create Workspace"
   - Name it (e.g., "PashuVision" or "My Projects")
   - Select a plan (Free tier is fine to start)
   - Click "Create Workspace"

#### Step 2: Create New Project

1. **From the Dashboard**
   - You should now see your workspace dashboard
   - Click the **"New Project"** button (green button in top right)

2. **Connect GitHub Repository**
   - Select **"Deploy from GitHub repo"**
   - If this is your first time, authorize Railway to access your GitHub
   - Search for and select your repository: `-PashuVision` (or your repo name)
   - Click on the repository

#### Step 3: Configure the Service (IMPORTANT!)

1. **Railway may detect Node.js instead of Python**
   - If build fails with Node.js errors, follow these steps carefully

2. **Configure Service Settings**
   - Click on the service that Railway created
   - Go to **"Settings"** tab
   - Configure the following:

   **Root Directory:**
   - Set to: `backend/models`
   - This tells Railway where your Python service is located
   - **This is critical - Railway must use this directory!**

   **Start Command:**
   - Set to: `python pytorch_service.py`
   - Or: `python3 pytorch_service.py` (if Python 3 is required)

   **Build Command:**
   - Leave this **EMPTY** or set to: `pip install -r requirements.txt`
   - Do NOT use npm commands here!

   **Override Nixpacks Config:**
   - Scroll down to find "Nixpacks Config" section
   - You can leave this as auto-detected
   - OR set to force Python detection

3. **Force Python Detection (If Railway detects Node.js)**
   - If Railway keeps trying to build with Node.js:
   - In Settings, look for "Build Pack" or "Language"
   - Force it to use "Python" instead of auto-detect
   - Alternatively, create a `Procfile` in `backend/models/`:
     ```
     web: python pytorch_service.py
     ```
   - This helps Railway detect Python correctly

4. **Install Dependencies**
   - Railway should automatically detect `requirements.txt` in `backend/models/`
   - Verify `requirements.txt` exists in `backend/models/` folder:
   ```
   flask==2.3.3
   flask-cors==4.0.0
   torch>=2.0.0
   torchvision>=0.15.0
   Pillow>=10.0.0
   timm>=0.9.0
   ```

#### Step 4: Environment Variables

1. **Go to Variables Tab**
   - Click on your service
   - Click **"Variables"** tab
   - Railway automatically sets `PORT` - **don't change this**

2. **Add Custom Variables** (if needed)
   - Most likely you won't need any additional variables
   - The service will use default settings

#### Step 5: Deploy and Get URL

1. **Deploy**
   - Railway will automatically start deploying
   - Watch the build logs in the "Deployments" tab
   - Wait for deployment to complete (usually 2-5 minutes)

2. **Get Service URL**
   - Once deployed, go to **"Settings"** tab
   - Scroll down to **"Networking"** section
   - Click **"Generate Domain"** if no domain exists
   - Copy the public URL (e.g., `https://pytorch-service-production.up.railway.app`)
   - **Important:** Save this URL - you'll need it for Vercel

#### Step 6: Verify Service is Running

1. **Test Health Endpoint**
   - Open the service URL in browser
   - Add `/health` to the end: `https://your-service.up.railway.app/health`
   - You should see JSON response:
   ```json
   {
     "status": "healthy",
     "model_loaded": true,
     "device": "cpu"
   }
   ```

#### Step 7: Configure Vercel

1. **Go to Vercel Dashboard**
   - Open your Vercel project: `https://vercel.com/your-username/pashu-vision`
   - Click on **"Settings"** tab
   - Click on **"Environment Variables"** in the left sidebar

2. **Add PYTORCH_SERVICE_URL**
   - Click **"Add New"**
   - **Key:** `PYTORCH_SERVICE_URL`
   - **Value:** Your Railway service URL (from Step 5)
     - Example: `https://pytorch-service-production.up.railway.app`
   - **Environment:** Select "Production", "Preview", and "Development" (or just "Production")
   - Click **"Save"**

3. **Redeploy Vercel**
   - Go to **"Deployments"** tab
   - Click the three dots (...) on the latest deployment
   - Click **"Redeploy"**
   - Or make a small change and push to GitHub to trigger auto-deploy

#### Step 8: Test the Integration

1. **Test Prediction**
   - Go to your Vercel app: `https://pashu-vision.vercel.app`
   - Navigate to "New Record"
   - Upload an image
   - Click "AI Breed Prediction"
   - It should now work without 503 errors!

### Troubleshooting Railway Deployment

**Error: "workspaceId must be specified"**
- Solution: You must create a workspace first (see Step 1 above)
- Go to Railway dashboard → Create Workspace → Then create project

**Error: "Build failed - Module not found"**
- Solution: Ensure `requirements.txt` exists in `backend/models/`
- Check build logs for missing dependencies

**Error: "Port already in use"**
- Solution: Railway sets PORT automatically - don't set it manually
- The service should use `os.environ.get('PORT', 5001)`

**Service keeps restarting**
- Check logs in Railway dashboard
- Ensure model file exists: `backend/models/best_model_convnext_base_acc0.7007.pth`
- Check for Python import errors in logs

**Cannot access service URL**
- Ensure you clicked "Generate Domain" in Settings → Networking
- Check that service is in "Active" state (not crashed)
- Wait a few minutes after deployment for DNS propagation

### Option 2: Deploy to Render

1. **Create Render Account**
   - Go to [render.com](https://render.com)
   - Sign up with GitHub

2. **Create Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository

3. **Configure Service**
   - Name: `pytorch-prediction-service`
   - Root Directory: `backend/models`
   - Environment: `Python 3`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `python pytorch_service.py`

4. **Add Environment Variables**
   - `PORT`: Render will set this automatically

5. **Deploy**
   - Click "Create Web Service"
   - Render will build and deploy
   - Copy the service URL (e.g., `https://your-service.onrender.com`)

6. **Configure Vercel**
   - Go to Vercel project settings
   - Add environment variable:
     - Key: `PYTORCH_SERVICE_URL`
     - Value: Your Render service URL

7. **Redeploy Vercel**
   - Trigger a new deployment

### Option 3: Deploy to Heroku

1. **Install Heroku CLI**
   ```bash
   # macOS
   brew tap heroku/brew && brew install heroku
   
   # Windows
   # Download from https://devcenter.heroku.com/articles/heroku-cli
   ```

2. **Create Heroku App**
   ```bash
   cd backend/models
   heroku create your-service-name
   ```

3. **Create Procfile**
   Create `Procfile` in `backend/models/`:
   ```
   web: python pytorch_service.py
   ```

4. **Deploy**
   ```bash
   git add Procfile
   git commit -m "Add Procfile for Heroku"
   git push heroku main
   ```

5. **Configure Vercel**
   - Add environment variable `PYTORCH_SERVICE_URL` = `https://your-service-name.herokuapp.com`

### Option 4: Use Your Own Server/VPS

1. **SSH into your server**
   ```bash
   ssh user@your-server.com
   ```

2. **Clone repository**
   ```bash
   git clone https://github.com/your-username/your-repo.git
   cd your-repo/backend/models
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Run as systemd service** (recommended)
   Create `/etc/systemd/system/pytorch-service.service`:
   ```ini
   [Unit]
   Description=PyTorch Prediction Service
   After=network.target

   [Service]
   Type=simple
   User=your-user
   WorkingDirectory=/path/to/backend/models
   ExecStart=/usr/bin/python3 pytorch_service.py
   Restart=always
   Environment="PORT=5001"

   [Install]
   WantedBy=multi-user.target
   ```

5. **Start service**
   ```bash
   sudo systemctl enable pytorch-service
   sudo systemctl start pytorch-service
   ```

6. **Configure Vercel**
   - Add environment variable `PYTORCH_SERVICE_URL` = `http://your-server.com:5001` or use a reverse proxy

## Verify Service is Running

Test the service health endpoint:
```bash
curl https://your-service-url/health
```

Expected response:
```json
{
  "status": "healthy",
  "model_loaded": true,
  "device": "cpu"
}
```

## Troubleshooting

### Service returns 503
- Check if service is running: `curl https://your-service-url/health`
- Check service logs on your hosting platform
- Verify model file exists in `backend/models/`

### Service timeout
- Increase timeout in hosting platform settings
- Consider using a service with longer timeouts (Railway, Render free tier has limits)

### Model not loading
- Verify `best_model_convnext_base_acc0.7007.pth` exists in `backend/models/`
- Check file permissions
- Review service logs for loading errors

## Notes

- **Free Tier Limits**: Railway, Render, and Heroku free tiers may spin down after inactivity. Consider upgrading for production use.
- **Cold Starts**: Serverless platforms may have cold start delays. First request might be slow.
- **Cost**: For high-traffic applications, consider dedicated servers or GPU instances for faster predictions.

