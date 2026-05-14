# Production Deployment Guide - Active Recall API

To ensure this project is "production ready" and "doesn't stop", follow these instructions.

## 1. Prerequisites
- **Docker & Docker Compose**: Recommended for high availability and easy restarts.
- **MongoDB**: The app now uses MongoDB for job tracking (production-ready) instead of local files.

## 2. Deployment via Docker (Recommended)
Docker Compose will automatically handle service restarts if the app crashes.

```bash
# Build and start the services
docker-compose up -d --build
```

- **Restart Policy**: The `docker-compose.yml` is configured with `restart: always`, ensuring the container starts automatically after a crash or system reboot.
- **Port**: The app runs on port `5000` as per your `.env`.

## 3. Deployment via PM2 (Process Manager)
If you prefer running directly on the host machine (Windows/Linux):

1. Install PM2: `npm install pm2 -g`
2. Start the app:
   ```bash
   pm2 start main.py --name active-recall --interpreter python
   ```
3. Ensure it starts on reboot: `pm2 save`

## 4. Key Improvements Made
- **Global Error Handling**: Added a middleware to catch all unhandled exceptions, preventing the server from crashing.
- **Persistent Job Tracking**: Moved job status tracking from a JSON file to MongoDB. This prevents data loss and concurrency issues during bulk PDF processing.
- **Structured Logging**: All errors and key events are logged to `app.log`.
- **Environment Variables**: Moved hardcoded secrets and URLs to `.env`.
- **CORS Middleware**: Enabled CORS for cross-origin requests (essential for production frontends).
- **Graceful Background Tasks**: Using FastAPI's `BackgroundTasks` correctly with database persistence.

## 5. Monitoring
Check the logs to monitor app health:
- **File**: `app.log`
- **PM2**: `pm2 logs active-recall`
- **Docker**: `docker logs -f <container_id>`
