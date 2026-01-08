FROM python:3.11-slim

WORKDIR /app

# Install only what is needed
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY backend/models/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code ONLY (no model)
COPY backend/models/pytorch_service.py .
COPY backend/models/model_info.json* .

# Startup script: download model at runtime
RUN echo '#!/bin/bash\n\
set -e\n\
MODEL_FILE="best_model_convnext_base_acc0.7007.pth"\n\
if [ ! -f "$MODEL_FILE" ]; then\n\
  echo "Downloading model..."\n\
  curl -L "$MODEL_DOWNLOAD_URL" -o "$MODEL_FILE"\n\
fi\n\
exec python pytorch_service.py' > /app/start.sh && chmod +x /app/start.sh

EXPOSE 5001
CMD ["/app/start.sh"]
