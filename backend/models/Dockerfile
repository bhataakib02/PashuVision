# Dockerfile for Python PyTorch Service
FROM python:3.11-slim

WORKDIR /app

# Install curl for downloading model if needed
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY backend/models/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy service files (model file may not be in Git due to LFS)
COPY backend/models/pytorch_service.py .
COPY backend/models/model_info.json* .

# Create startup script that handles model file
RUN echo '#!/bin/bash\n\
set -e\n\
if [ ! -f "best_model_convnext_base_acc0.7007.pth" ]; then\n\
  echo "Model file not found in build, checking MODEL_DOWNLOAD_URL..."\n\
  if [ ! -z "$MODEL_DOWNLOAD_URL" ]; then\n\
    echo "Downloading model from: $MODEL_DOWNLOAD_URL"\n\
    curl -L "$MODEL_DOWNLOAD_URL" -o best_model_convnext_base_acc0.7007.pth\n\
    echo "Model downloaded successfully"\n\
  else\n\
    echo "ERROR: Model file not found and MODEL_DOWNLOAD_URL not set"\n\
    echo "Please set MODEL_DOWNLOAD_URL environment variable in Railway"\n\
    exit 1\n\
  fi\n\
else\n\
  echo "Model file found, using existing file"\n\
fi\n\
exec python pytorch_service.py' > /app/start.sh && chmod +x /app/start.sh

# Try to copy model file if it exists (won't fail if missing due to Git LFS)
COPY backend/models/*.pth* . || echo "Model file not in Git, will download at runtime if MODEL_DOWNLOAD_URL is set"

# Expose port (Railway sets PORT env var automatically)
EXPOSE ${PORT:-5001}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD python -c "import requests; requests.get('http://localhost:${PORT:-5001}/health')" || exit 1

# Start the service using the script
CMD ["/app/start.sh"]
