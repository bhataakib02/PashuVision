# Fix Railway Model File Issue

## Problem
The model file `best_model_convnext_base_acc0.7007.pth` (437 MB) is tracked by Git LFS but the upload failed. Railway can't access it during build.

## Solutions

### Option 1: Upload Model File to Cloud Storage (Recommended)

1. **Upload model to cloud storage:**
   - Google Drive
   - Dropbox  
   - AWS S3
   - Any public file hosting

2. **Update Dockerfile to download at runtime:**
   ```dockerfile
   # Download model file from cloud storage
   RUN curl -L "YOUR_MODEL_URL" -o best_model_convnext_base_acc0.7007.pth
   ```

3. **Or use environment variable:**
   - Set `MODEL_DOWNLOAD_URL` in Railway
   - Dockerfile downloads from that URL

### Option 2: Fix Git LFS Upload

Try uploading again:
```powershell
git lfs push origin main --all
```

Or if Git LFS isn't working, remove LFS tracking:
```powershell
git lfs untrack "*.pth"
git add .gitattributes
git commit -m "Remove LFS tracking for pth files"
git add backend/models/best_model_convnext_base_acc0.7007.pth
git commit -m "Add model file directly to Git"
git push origin main
```

⚠️ **Warning:** This will commit 437 MB directly to Git, which is not recommended.

### Option 3: Make Model Optional (For Testing)

Update Dockerfile to make model file optional and download from a URL.

