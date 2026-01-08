# Dockerfile for Python PyTorch Service
FROM python:3.11-slim

WORKDIR /app

# Install git, git-lfs, and curl for downloading model if needed
RUN apt-get update && apt-get install -y git git-lfs curl && \
    git lfs install && \
    rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY backend/models/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy service files
COPY backend/models/pytorch_service.py .
COPY backend/models/model_info.json* .

# (Model file is NOT included in the image to keep it small)
# It will be downloaded at runtime from MODEL_DOWNLOAD_URL if missing

# Create startup script that handles model file
RUN echo '#!/bin/bash\n\
set -e\n\
MODEL_FILE="best_model_convnext_base_acc0.7007.pth"\n\
if [ ! -f "$MODEL_FILE" ] || [ ! -s "$MODEL_FILE" ] || grep -q "version https://git-lfs" "$MODEL_FILE" 2>/dev/null; then\n\
  echo "Model file not found or is LFS pointer, checking MODEL_DOWNLOAD_URL..."\n\
  if [ ! -z "$MODEL_DOWNLOAD_URL" ]; then\n\
    echo "Downloading model from: $MODEL_DOWNLOAD_URL"\n\
    curl -L "$MODEL_DOWNLOAD_URL" -o "$MODEL_FILE"\n\
    echo "Model downloaded successfully"\n\
  else\n\
    echo "ERROR: Model file not available and MODEL_DOWNLOAD_URL not set"\n\
    echo "Please set MODEL_DOWNLOAD_URL environment variable in Railway"\n\
    echo "Or ensure Git LFS files are properly cloned during Railway build"\n\
    exit 1\n\
  fi\n\
else\n\
  echo "Model file found, using existing file"\n\
fi\n\
exec python pytorch_service.py' > /app/start.sh && chmod +x /app/start.sh

# Expose port (Railway sets PORT env var automatically)
EXPOSE ${PORT:-5001}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD python -c "import requests; requests.get('http://localhost:${PORT:-5001}/health')" || exit 1

# Start the service using the script
CMD ["/app/start.sh"]
