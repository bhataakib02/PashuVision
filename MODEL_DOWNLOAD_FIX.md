# Model Download & Validation Fix

## Problem
The Railway service was failing to load the model with error:
```
Failed to load checkpoint: PytorchStreamReader failed reading zip archive: failed finding central directory
```

This indicates the downloaded model file was corrupted or incomplete.

## Root Causes
1. **Corrupted downloads** - Network issues during download
2. **Git LFS pointers** - File might be a Git LFS pointer instead of actual file
3. **Incomplete downloads** - Download interrupted or failed silently
4. **Invalid file format** - File might be HTML error page instead of model file

## Solutions Implemented ✅

### 1. **File Validation Before Loading**
- Check file size (must be > 50MB)
- Validate magic bytes (ZIP or PyTorch format)
- Detect Git LFS pointers
- Remove corrupted files automatically

### 2. **Improved Download Logic**
- Download to temp file first
- Validate file after download
- Check for HTML error pages (404 pages)
- Only move to final location if valid
- Clean up on failure

### 3. **Better Error Handling**
- Detect corrupted files and remove them
- Retry with fresh download
- Clear error messages
- Automatic cleanup

### 4. **Git LFS Detection**
- Check if file is Git LFS pointer
- Re-download if pointer detected
- Handle LFS pointers gracefully

## Code Changes

### `backend/models/pytorch_service.py`
- Added `model_file_valid` check before loading
- Added file size validation (>50MB)
- Added magic byte validation
- Added Git LFS pointer detection
- Improved download with temp file and validation
- Automatic corrupted file removal

### `backend/src/ai/PyTorchPredictor.js`
- Better error messages for "model not loaded" status
- Handle 503 responses with clearer messages
- Distinguish between "loading" and "not loaded" states

## Expected Behavior

### First Request:
1. Service receives prediction request
2. Model file not found → Downloads from GitHub release
3. Validates download (size, format)
4. Loads model (30-60 seconds)
5. Returns predictions

### If Download Fails:
1. Detects corrupted/invalid file
2. Removes corrupted file
3. Retries download (up to 3 attempts)
4. Clear error messages

## Verification

After deployment, check Railway logs for:
- ✅ "Model downloaded successfully (XXX MB)"
- ✅ "Checkpoint loaded successfully"
- ✅ "Model loaded successfully on cpu (memory optimized)"

If you see:
- ⚠️ "Model file too small" → Download failed, will retry
- ⚠️ "Model file is a Git LFS pointer" → Will re-download
- ❌ "Failed to load checkpoint" → File corrupted, will retry

## Troubleshooting

### Model Still Not Loading?

1. **Check Railway Logs**:
   - Look for download errors
   - Check file size messages
   - Verify download URL is accessible

2. **Verify GitHub Release**:
   - Ensure model file exists in GitHub releases
   - Check file size is correct (>50MB)
   - Verify download URL is correct

3. **Set MODEL_DOWNLOAD_URL** (if needed):
   - In Railway: Settings → Variables
   - Add: `MODEL_DOWNLOAD_URL` = direct download URL
   - Redeploy

4. **Check Memory**:
   - Railway free tier has 512MB RAM
   - Model loading uses ~100-150MB
   - Should be within limits

---

**Status**: ✅ Model download validation implemented
**Expected Result**: Model downloads correctly and validates before loading
**Last Updated**: 2026-01-15

