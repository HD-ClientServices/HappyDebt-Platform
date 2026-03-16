# Intro Client Portal

Next.js 14 App Router + Supabase + Tailwind + shadcn/ui.

## Setup

1. Copy `env.example` to `.env.local` and set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

2. Supabase: run migrations in `supabase/migrations/` (e.g. via Supabase Dashboard SQL or `supabase db push`).

3. Install and run:
   ```bash
   npm install
   npm run dev
   ```

4. **Global CSS**: Add `import "./global.css"` (or `import "@/styles/global.css"`) at the top of `app/layout.tsx` to enable Tailwind. CSS lives in `app/global.css` or `styles/global.css`. If build fails with a Webpack/Sucrase CSS error, try `rm -rf .next node_modules && npm install` or use `npm run dev` for local development.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run start` — start production server
- `npm run lint` — ESLint

## Structure

- `app/` — App Router pages and layouts
- `components/` — UI (shadcn) and shared (layout, drill-down, audio)
- `lib/` — Supabase clients, utils
- `store/` — Zustand (UI state)
- `types/` — Database types
- `supabase/migrations/` — SQL schema and RLS
