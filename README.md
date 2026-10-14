# Kontrora

Professional Services Automation (PSA) platform built with **Next.js** (App Router) and **Supabase**.

Initial project version for exploring the codebase, stack, and structure.

## Stack

- Next.js 16 + React 19
- TypeScript / JavaScript
- Tailwind CSS
- Supabase (Auth + Postgres)
- Vitest

## Setup

Requires Node.js **20.9+** and a free [Supabase](https://supabase.com) project.

```bash
npm install
cp .env.local.template .env.local   # fill Supabase URL + keys
# Run supabase/schema.sql in the Supabase SQL Editor
npm run dev                        # http://localhost:3000
```

## Project structure

- `app/` — App Router layouts and pages
- `app/api/` — API routes
- `components/` — Shared UI and domain components
- `lib/` — Auth, access control, and services
- `supabase/` — Database schema

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
