# Deploying Python Prediction Service

The PyTorch prediction service **cannot run on Vercel** because it requires:
- Long-running processes (Vercel is serverless)
- Large dependencies (PyTorch, torchvision, etc.)
- GPU/CPU-intensive operations

## Solution: Deploy Python Service Separately

You have two options:

### Option 1: Deploy to Railway (Recommended - Easy Setup)

1. **Create Railway Account**
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Select your repository

3. **Configure Service**
   - Railway will auto-detect the Python service
   - If not, add service manually:
     - Root directory: `backend/models`
     - Start command: `python pytorch_service.py`
     - Python version: 3.9 or higher

4. **Add Environment Variables** (if needed)
   - `PORT`: Railway will set this automatically
   - Add any other required variables

5. **Deploy**
   - Railway will automatically deploy
   - Copy the service URL (e.g., `https://your-service.up.railway.app`)

6. **Configure Vercel**
   - Go to Vercel project settings
   - Add environment variable:
     - Key: `PYTORCH_SERVICE_URL`
     - Value: Your Railway service URL (e.g., `https://your-service.up.railway.app`)

7. **Redeploy Vercel**
   - Trigger a new deployment in Vercel
   - The app will now use your external Python service

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

