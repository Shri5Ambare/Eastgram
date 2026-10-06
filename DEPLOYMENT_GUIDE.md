# EduGram PandaStack + Vercel Deployment Guide

This guide details how to deploy **EduGram** for free using **PandaStack** (Backend API + Database + Redis) and **Vercel** (Flutter Web Frontend).

---

## 📋 Architecture

- 🖥️ **Backend API**: PandaStack Container Web Service (`Dockerfile`)
- 🗄️ **Database**: PandaStack Managed PostgreSQL Database (or Supabase)
- ⚡ **Redis Cache**: PandaStack Managed Redis (or Upstash)
- 🌐 **Frontend**: Vercel (Flutter Web App)

---

## 🚀 Step 1: Deploy Backend & Database on PandaStack

1. Go to [pandastack.com](https://pandastack.com) and log in with your GitHub account.
2. Click **Create Project** -> Name it `edugram`.
3. **Add Database**:
   - Click **+ Add Database** -> Choose **PostgreSQL**.
   - Copy the database connection URL (`DATABASE_URL`).
4. **Add Redis**:
   - Click **+ Add Service/Database** -> Choose **Redis**.
   - Copy `REDIS_HOST`, `REDIS_PORT` (`6379`), and `REDIS_PASSWORD`.
5. **Deploy Backend Web Service**:
   - Click **+ New Service** -> Select **GitHub Repository**.
   - Choose `Shri5Ambare/Eastgram`.
   - PandaStack will automatically pick up `pandastack.yaml` and `Dockerfile`.
   - Set the following Environment Variables in the service settings:

| Key | Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Production environment |
| `PORT` | `3000` | HTTP Port |
| `APP_SCHOOL_ID` | `[EXISTING-SCHOOL-ID]` | The single school served by this deployment; optional only if exactly one school exists |
| `DATABASE_URL` | `postgresql://...` | Connection string from PandaStack Postgres |
| `REDIS_HOST` | `[REDIS_HOST]` | Host from PandaStack Redis |
| `REDIS_PORT` | `6379` | Redis Port |
| `REDIS_PASSWORD` | `[REDIS_PASSWORD]` | Redis Password |
| `JWT_ACCESS_SECRET` | `[RANDOM-SECURE-STRING]` | 64-char hex secret |
| `JWT_REFRESH_SECRET` | `[RANDOM-SECURE-STRING]` | 64-char hex secret |
| `REDIS_ADAPTER_ENABLED` | `true` | Enable Socket.io multi-node adapter |

6. Provision the school's record and set `APP_SCHOOL_ID` before starting the API. The app deliberately fails startup when the school is missing or ambiguous. Do not run the demo seed in production; it creates sample accounts with a shared password.

7. Save and deploy! PandaStack will build the container, run database migrations (`npx prisma migrate deploy`), and assign a public URL (e.g. `https://edugram-api.pandastack.app`).

---

## 🌐 Step 2: Deploy Frontend on Vercel

1. Log in to [vercel.com](https://vercel.com) -> **Add New** -> **Project**.
2. Import `Shri5Ambare/Eastgram` repository.
3. Set **Root Directory** to `frontend`.
4. Add Environment Variables:
   - `API_BASE_URL`: `https://edugram-api.pandastack.app/api/v1`
   - `SOCKET_URL`: `https://edugram-api.pandastack.app`
5. Click **Deploy**. Vercel uses `frontend/vercel.json` to build and serve the release Flutter Web app.
