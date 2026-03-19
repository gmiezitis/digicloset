FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for OpenCV
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install MiDaS dependencies (CPU only for cost efficiency)
RUN pip install --no-cache-dir \
    torch==2.1.0+cpu \
    torchvision==0.16.0+cpu \
    --index-url https://download.pytorch.org/whl/cpu

RUN pip install --no-cache-dir \
    timm==0.9.12 \
    opencv-python-headless==4.8.1.78 \
    flask==3.0.0 \
    gunicorn==21.2.0 \
    Pillow==10.1.0

# Download MiDaS model at build time (faster cold starts)
RUN python -c "import torch; torch.hub.load('intel-isl/MiDaS', 'MiDaS_small', trust_repo=True)"

COPY app.py .

ENV PORT=8080
ENV PYTHONUNBUFFERED=1

# Health check for Cloud Run
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

CMD exec gunicorn --bind :$PORT --workers 1 --threads 1 --timeout 120 app:app
