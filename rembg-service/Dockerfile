FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for image processing
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install rembg with ONNX runtime (CPU optimized for cost)
RUN pip install --no-cache-dir \
    rembg[cpu]==2.0.50 \
    flask==3.0.0 \
    gunicorn==21.2.0

# Pre-download model at build time (faster cold starts)
RUN python -c "from rembg import new_session; new_session('u2net')"

COPY app.py .

ENV PORT=8080
ENV PYTHONUNBUFFERED=1

# Health check for Cloud Run
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Run with gunicorn for production
CMD exec gunicorn --bind :$PORT --workers 1 --threads 2 --timeout 120 app:app
