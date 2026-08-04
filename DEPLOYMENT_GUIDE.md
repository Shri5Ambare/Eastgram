# EduGram Railway & Cloud Deployment Guide

This guide details how to deploy **EduGram** on **Railway** (PostgreSQL + Redis + NestJS API) and **Vercel** (Flutter Web Frontend).

---

## 📋 Quick Setup Overview (Railway)

Railway allows deploying your **PostgreSQL Database**, **Redis Cache**, and **NestJS Web Service** all within a single unified project.

### 1. Prerequisites
* [GitHub Account](https://github.com)
* [Railway Account](https://railway.com)
* [Vercel Account](https://vercel.com) (for Flutter Web frontend)

---

## 🚀 Railway Deployment (Backend + DB + Redis)

### Step 1: Create a New Project on Railway
1. Go to [railway.com/dashboard](https://railway.com/dashboard) and click **+ New Project**.
2. Select **Provision PostgreSQL** to create your database.
3. Click **+ New** -> **Database** -> **Add Redis** to create your cache instance.

### Step 2: Deploy Backend Web Service
1. In the same Railway project, click **+ New** -> **GitHub Repo**.
2. Select your repository `Shri5Ambare/Eastgram`.
3. Railway will automatically detect `railway.json` and `Dockerfile`.

### Step 3: Connect Environment Variables
In your Web Service settings under **Variables**:
1. Click **Add Reference** -> select `DATABASE_URL` from your Railway PostgreSQL service.
2. Click **Add Reference** -> select `REDIS_URL` (or `REDISHOST`, `REDISPORT`, `REDISPASSWORD`) from your Railway Redis service.
3. Add the following custom variables:

| Key | Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Production runtime |
| `PORT` | `3000` | Port for container listener |
| `JWT_ACCESS_SECRET` | `[SECURE-RANDOM-STRING]` | 64-char hex secret |
| `JWT_REFRESH_SECRET` | `[SECURE-RANDOM-STRING]` | 64-char hex secret |
| `REDIS_ADAPTER_ENABLED` | `true` | Enable Socket.io multi-node scaling |

4. Save and deploy. Railway will run database migrations automatically via `npx prisma migrate deploy` and start the server.

### Step 4: Expose Public Domain
1. In the Web Service settings -> **Networking**, click **Generate Domain**.
2. Copy the generated domain (e.g. `https://edugram-production.up.railway.app`).

---

## 🌐 Frontend Deployment (Vercel)

Vercel deploys automatically via GitHub Actions when pushing to `master`:
1. On GitHub Repo -> **Settings** -> **Secrets and variables** -> **Actions**.
2. Add repo secrets:
   * `VERCEL_TOKEN`: Vercel Account Token
   * `VERCEL_ORG_ID`: Vercel Org ID
   * `VERCEL_PROJECT_ID`: Vercel Project ID
   * `API_BASE_URL`: `https://[YOUR-RAILWAY-APP].up.railway.app/api/v1`
   * `SOCKET_URL`: `https://[YOUR-RAILWAY-APP].up.railway.app`
