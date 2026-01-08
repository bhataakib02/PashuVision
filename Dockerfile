# Dockerfile for Python PyTorch Service
FROM python:3.11-slim

WORKDIR /app

# Install curl only (no git, no git-lfs)
RUN apt-get update && apt-get install -y curl && \
    rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY backend/models/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy service files (NO MODEL FILE)
COPY backend/models/pytorch_service.py .
COPY backend/models/model_info.json* .

# Startup script: download model at runtime
RUN echo '#!/bin/bash\n\
set -e\n\
MODEL_FILE="best_model_convnext_base_acc0.7007.pth"\n\
if [ ! -f "$MODEL_FILE" ]; then\n\
  echo "Model file not found, downloading..."\n\
  if [ -z "$MODEL_DOWNLOAD_URL" ]; then\n\
    echo "ERROR: MODEL_DOWNLOAD_URL not set"\n\
    exit 1\n\
  fi\n\
  curl -L "$MODEL_DOWNLOAD_URL" -o "$MODEL_FILE"\n\
  echo "Model downloaded successfully"\n\
else\n\
  echo "Model file already present"\n\
fi\n\
exec python pytorch_service.py' > /app/start.sh && chmod +x /app/start.sh

# Expose port
EXPOSE ${PORT:-5001}

# Start service
CMD ["/app/start.sh"]
