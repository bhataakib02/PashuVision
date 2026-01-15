# Lazy Loading Fix - OOM Prevention

## Problem
Even with memory optimizations, the service was still crashing with OOM errors during startup because the model was loading immediately when Gunicorn started the worker process.

## Root Cause
- Model loading started **immediately** when the module was imported
- This happened during Gunicorn worker startup
- Railway's memory limits were exceeded before the service could even start serving requests

## Solution: Lazy Loading ✅

### What Changed
1. **Model no longer loads on startup** - Service starts immediately without loading model
2. **Model loads on-demand** - First prediction request triggers model loading
3. **Service stays healthy** - Health endpoint works without model, preventing Railway crashes
4. **Delayed loading** - 5 second delay before loading to let service stabilize

### Benefits
- ✅ **Service starts successfully** - No OOM during startup
- ✅ **Health checks pass** - Railway doesn't kill the service
- ✅ **Model loads when needed** - First user request triggers loading
- ✅ **Better memory management** - Service stabilizes before loading

## How It Works

### Startup Flow:
1. Service starts → No model loading
2. Health check passes → Service marked as healthy
3. First `/predict` or `/species` request → Triggers model loading
4. Model loads in background → Service continues accepting requests
5. Subsequent requests → Use loaded model

### Code Changes:
- Added `eager_load` flag (defaults to `false`)
- Removed automatic model loading on import
- Added lazy loading triggers in `/predict` and `/species` endpoints
- Added 5-second delay before model loading starts

## Configuration

### Default Behavior (Recommended):
- Model loads lazily on first prediction request
- No environment variable needed

### Eager Loading (Not Recommended for Railway):
Set environment variable:
```bash
EAGER_LOAD_MODEL=true
```
⚠️ **Warning**: This may cause OOM on Railway free tier

## Expected Behavior

### First Request:
- Request comes in → Model loading starts
- Returns 503 "Model is still loading" 
- User waits ~30-60 seconds
- Retry request → Model ready, prediction succeeds

### Subsequent Requests:
- Model already loaded → Immediate predictions
- No delay, normal performance

## Monitoring

Watch for these in Railway logs:
- ✅ "Lazy model loading enabled - model will load on first prediction request"
- ✅ "First prediction request - starting lazy model loading"
- ✅ "Model loaded successfully on cpu (memory optimized)"

## Trade-offs

### Pros:
- ✅ Service starts reliably
- ✅ No OOM during startup
- ✅ Health checks always pass

### Cons:
- ⚠️ First prediction request takes longer (~30-60 seconds)
- ⚠️ User needs to retry first request

## Alternative Solutions (If Needed)

If lazy loading doesn't work:

1. **Upgrade Railway Plan**:
   - Hobby: $5/month with 1GB RAM
   - Pro: $20/month with 2GB RAM

2. **Use Smaller Model**:
   - Further reduce model size
   - Use quantization (INT8)

3. **External Model Service**:
   - Host model on separate service with more memory
   - Call via API

---

**Status**: ✅ Lazy loading implemented
**Expected Result**: Service starts without OOM, model loads on first request
**Last Updated**: 2026-01-15

