# Deployment Guide (Vercel + Fly.io)

## Overview
- Vercel hosts the Next.js UI + API routes.
- Fly.io hosts the Playwright worker service.

## 1) Fly.io (Worker)
1) Install Fly CLI and login.
2) From repo root, create a Fly app:
   - `fly launch --name jobpilot-worker --region <closest>`
3) Set env vars for the worker:
   - `PORT=8787`
4) Deploy:
   - `fly deploy`
5) Note the worker URL (e.g., `https://jobpilot-worker.fly.dev`).

## 2) Vercel (Web)
1) In Vercel, import the repo.
2) Set the project root to `web/`.
3) Set environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `WORKER_URL` (Fly worker URL)
   - `NEXT_PUBLIC_APP_NAME=JobPilot`
4) Deploy.

## 3) Supabase Auth
- Ensure Email verification is enabled.
- Add your Vercel URL to Auth redirect URLs.

## Local Dev
- Run worker: `npm run worker:dev`
- Run web: `cd web && npm run dev`
