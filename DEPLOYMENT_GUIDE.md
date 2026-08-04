# EduGram 100% Free Cloud Deployment Guide

This guide details how to deploy **EduGram** for 100% free using:
- 🖥️ **Render** — Backend NestJS Web Service (Free Tier)
- 🌐 **Vercel** — Frontend Flutter Web App (Free Tier)
- 🗄️ **Supabase** — PostgreSQL Database (Free 500MB Tier)
- ⚡ **Upstash** — Redis Cache (Free Serverless Redis Tier)

---

## 1. Step-by-Step Setup

### Step 1: Database (Supabase)
1. Go to [supabase.com](https://supabase.com) -> **New Project**.
2. Go to **Project Settings** -> **Database** -> **Connection String (URI)**.
3. Copy string: `postgresql://postgres:[PASSWORD]@...pooler.supabase.com:6543/postgres?pgbouncer=true`

### Step 2: Redis Cache (Upstash)
1. Go to [console.upstash.com](https://console.upstash.com) -> **Create Database** (Redis).
2. Note: `REDIS_HOST`, `REDIS_PORT` (6379), and `REDIS_PASSWORD`.

### Step 3: Backend API (Render)
1. Log in to [dashboard.render.com](https://dashboard.render.com) -> **New +** -> **Web Service**.
2. Connect your GitHub repository `Shri5Ambare/Eastgram`.
3. Render automatically detects `render.yaml` or set:
   - **Environment**: Docker
   - **Plan**: Free
   - **Health Check Path**: `/api/v1/health`
4. In **Environment Variables**, set:
   - `DATABASE_URL`: `[Your Supabase connection string]`
   - `REDIS_HOST`: `[Your Upstash host]`
   - `REDIS_PORT`: `6379`
   - `REDIS_PASSWORD`: `[Your Upstash password]`
   - `JWT_ACCESS_SECRET`: `[64-char hex secret]`
   - `JWT_REFRESH_SECRET`: `[64-char hex secret]`
5. Click **Create Web Service**. Render builds the Docker image and gives you a free HTTPS URL (e.g. `https://edugram-backend.onrender.com`).

### Step 4: Frontend Web App (Vercel)
1. Log in to [vercel.com](https://vercel.com) -> **Add New** -> **Project**.
2. Import `Shri5Ambare/Eastgram` repository.
3. Set root directory to `frontend`.
4. Vercel automatically uses `frontend/vercel.json` to build Flutter Web and host it for free!
5. In Vercel Project Settings -> **Environment Variables**:
   - `API_BASE_URL`: `https://edugram-backend.onrender.com/api/v1`
   - `SOCKET_URL`: `https://edugram-backend.onrender.com`

---

## ✅ Deployment Summary
- **Backend API**: `https://edugram-backend.onrender.com`
- **Database**: Supabase PostgreSQL
- **Cache**: Upstash Redis
- **Frontend Web**: `https://edugram.vercel.app`
