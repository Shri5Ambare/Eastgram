# EduGram Free Cloud Deployment Guide

This guide walks you through deploying **EduGram** for free using a hybrid cloud setup (**Supabase + Upstash + Koyeb + Vercel + Cloudflare R2**).

---

## 📋 Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [Database Setup (Supabase)](#2-database-setup-supabase)
3. [Redis Cache Setup (Upstash)](#3-redis-cache-setup-upstash)
4. [Media Storage Setup (Cloudflare R2)](#4-media-storage-setup-cloudflare-r2)
5. [Backend API Deployment (Koyeb)](#5-backend-api-deployment-koyeb)
6. [Frontend Web Deployment (Vercel)](#6-frontend-web-deployment-vercel)

---

## 1. Prerequisites
Ensure you have free accounts on:
* [GitHub](https://github.com)
* [Supabase](https://supabase.com)
* [Upstash](https://upstash.com)
* [Cloudflare](https://cloudflare.com)
* [Koyeb](https://koyeb.com)
* [Vercel](https://vercel.com)

---

## 2. Database Setup (Supabase)
1. Log in to [Supabase](https://supabase.com) and click **New Project**.
2. Name the project, set a secure password, and select a region close to your users.
3. Once the database is ready, go to **Project Settings** -> **Database**.
4. Scroll to the **Connection string** section, choose **URI** format, and copy the string.
   * It will look like this:
     `postgresql://postgres:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true`
   * Keep this URL handy; you will use it as your `DATABASE_URL`.

---

## 3. Redis Cache Setup (Upstash)
1. Log in to [Upstash Console](https://console.upstash.com).
2. Click **Create Database**.
3. Set name, select **Redis**, and choose a region close to your database.
4. Copy the connection host, port, and password from the dashboard.
   * **Host:** `[NAME].upstash.io`
   * **Port:** `6379`
   * **Password:** `[PASSWORD]`

---

## 4. Media Storage Setup (Cloudflare R2)
1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com).
2. Go to **R2** (under the side menu) and click **Create Bucket**.
3. Name the bucket `edugram-media` and click create.
4. Go to **Manage R2 API Tokens** on the right sidebar and click **Create API Token**.
5. Set permissions to **Edit** (Read/Write) and create the token. Copy:
   * **Access Key ID**
   * **Secret Access Key**
   * **Account ID** (available on the main R2 page)
6. Under your bucket settings, enable **Public Access** (either through a Cloudflare domain or using the free `*.r2.dev` bucket subdomain). Note the **Public URL**.

---

## 5. Backend API Deployment (Koyeb)
1. Push your codebase to a private/public **GitHub repository**.
2. Log in to [Koyeb Console](https://app.koyeb.com).
3. Click **Create Service** -> select **GitHub**.
4. Select your repository.
5. In the **Build and Deployment** settings:
   * Koyeb will automatically detect the `Dockerfile` at the root.
   * Update the start command under **Run Command** to execute migrations before starting the Node server:
     ```bash
     npx prisma migrate deploy && node dist/main
     ```
6. Add the following **Environment Variables** in the configuration page:

| Key | Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Run in production mode |
| `PORT` | `3000` | Port container will listen to |
| `DATABASE_URL` | `postgresql://...` | Supabase connection string (copied in step 2) |
| `REDIS_HOST` | `[HOST].upstash.io` | Upstash host (copied in step 3) |
| `REDIS_PORT` | `6379` | Upstash port (copied in step 3) |
| `REDIS_PASSWORD` | `[PASSWORD]` | Upstash password (copied in step 3) |
| `REDIS_ADAPTER_ENABLED` | `true` | Sharing WebSocket notifications |
| `JWT_ACCESS_SECRET` | `[RANDOM-SECURE-STRING]` | Access token secret (e.g. 64-character hex) |
| `JWT_REFRESH_SECRET` | `[RANDOM-SECURE-STRING]` | Refresh token secret (e.g. 64-character hex) |
| `R2_ACCOUNT_ID` | `[ACCOUNT-ID]` | Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | `[ACCESS-KEY-ID]` | Cloudflare R2 Access Key |
| `R2_SECRET_ACCESS_KEY` | `[SECRET-KEY]` | Cloudflare R2 Secret Key |
| `R2_BUCKET` | `edugram-media` | Bucket name |
| `R2_ENDPOINT` | `https://[ACCOUNT-ID].r2.cloudflarestorage.com` | R2 endpoint |
| `R2_PUBLIC_URL` | `https://[PUBLIC-URL].r2.dev` | Public bucket URL |

7. Set the port exposing setting to `3000` (HTTP protocol) and deploy. Koyeb will build the Docker container and provide a public URL (e.g. `https://[APP-NAME].koyeb.app`).
8. Copy the URL. Your API endpoint is `https://[APP-NAME].koyeb.app/api/v1` and your socket endpoint is `https://[APP-NAME].koyeb.app`.

---

## 6. Frontend Web Deployment (Vercel)
Vercel is deployed automatically via the GitHub Action workflow when you push to the `main` branch.
1. On your GitHub Repository, go to **Settings** -> **Secrets and variables** -> **Actions**.
2. Click **New repository secret** and add:
   * `VERCEL_TOKEN` — Vercel personal access token (create in Vercel settings under Tokens).
   * `VERCEL_ORG_ID` — Your Vercel account/team organization ID.
   * `VERCEL_PROJECT_ID` — Your Vercel project ID (create a blank project in Vercel first linking the `frontend` folder).
   * `API_BASE_URL` — `https://[APP-NAME].koyeb.app/api/v1` (your deployed Koyeb API).
   * `SOCKET_URL` — `https://[APP-NAME].koyeb.app` (your deployed Koyeb WebSocket endpoint).

Once these secrets are configured, any commit pushed to the `main` branch will automatically compile the Flutter Web release build using the remote endpoints and deploy it to Vercel.
