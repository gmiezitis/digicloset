---
description: How to deploy Firebase Cloud Functions and Docker services
---

# Cloud Deployment Guide

This workflow describes how to deploy the backend services for DigiCloset.

## Prerequisites

1. **Firebase CLI** installed: `npm install -g firebase-tools`
2. **Docker** installed and running
3. **Google Cloud CLI** installed: `gcloud`
4. **Firebase project** configured in `firebase.json`

## Step 1: Deploy Firebase Cloud Functions

```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

## Step 2: Build and Deploy Background Removal Service

```bash
# Build the Docker image
cd rembg-service
docker build -t gcr.io/YOUR_PROJECT_ID/rembg-service .

# Push to Google Container Registry
docker push gcr.io/YOUR_PROJECT_ID/rembg-service

# Deploy to Cloud Run
gcloud run deploy rembg-service \
  --image gcr.io/YOUR_PROJECT_ID/rembg-service \
  --platform managed \
  --region us-central1 \
  --memory 2Gi \
  --cpu 2 \
  --max-instances 10 \
  --allow-unauthenticated
```

## Step 3: Build and Deploy MiDaS Depth Service

```bash
# Build the Docker image
cd midas-service
docker build -t gcr.io/YOUR_PROJECT_ID/midas-service .

# Push to Google Container Registry
docker push gcr.io/YOUR_PROJECT_ID/midas-service

# Deploy to Cloud Run
gcloud run deploy midas-service \
  --image gcr.io/YOUR_PROJECT_ID/midas-service \
  --platform managed \
  --region us-central1 \
  --memory 4Gi \
  --cpu 2 \
  --max-instances 5 \
  --allow-unauthenticated
```

## Step 4: Configure Environment Variables

After deploying, set the service URLs in Firebase:

```bash
firebase functions:config:set \
  services.rembg_url="https://rembg-service-XXXX.run.app" \
  services.midas_url="https://midas-service-XXXX.run.app"
```

## Step 5: Update Mobile App Configuration

1. Update `src/constants/index.ts` with production URLs
2. Set `EXPO_PUBLIC_API_BASE_URL` in your build configuration

## Verification

1. Test rembg service:
   ```bash
   curl https://rembg-service-XXXX.run.app/health
   ```

2. Test midas service:
   ```bash
   curl https://midas-service-XXXX.run.app/health
   ```

3. Test Firebase function:
   ```bash
   curl https://us-central1-YOUR_PROJECT.cloudfunctions.net/getQuota
   ```

## Cost Optimization Tips

- Use Cloud Run's scale-to-zero feature (automatic)
- Set `--min-instances 0` for cold starts
- Consider using Cloud Run Jobs for batch processing
- Monitor costs in Google Cloud Console
