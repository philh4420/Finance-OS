# Finance OS (Modern Finance Dashboard)

Production-grade 2026+ Progressive Web App for personal/household finance operations, planning, governance, and reporting.

Built with `React 19`, `Vite 7`, `Tailwind CSS 4`, `shadcn/ui`, `Clerk`, and `Convex`.

## Overview

Finance OS is a live-data finance workspace (no dummy snapshots in normal flow) with:

- Clerk-authenticated user sessions
- Convex-backed real-time queries/mutations
- Multi-tab finance operations: dashboard, planning, accounts, income, bills, cards, loans, shopping, transactions, governance, reliability, automation
- PWA install/update/offline flows
- Professional print reporting and export workflows
- Multi-currency display + FX policy surfacing

## Tech Stack

- Frontend: `React 19`, `TypeScript 5.9`, `Vite 7`
- Styling/UI: `Tailwind CSS 4`, `shadcn/ui`, `Radix`, `Lucide`
- Charts: `Recharts`
- Auth: `Clerk`
- Backend: `Convex`
- PWA: `vite-plugin-pwa` + Workbox
- Notifications/Toasts: `sonner`
- Hosting: `Vercel`

## Architecture

- `src/App.tsx`: signed-out landing + signed-in app shell
- `src/components/dashboard/finance-dashboard.tsx`: authenticated workspace shell and orchestration
- `src/components/dashboard/workspace-tabs/*`: domain tabs
- `src/components/pwa/*`: install/update/offline queue reliability
- `convex/*`: schema, queries, mutations, automation, governance, reliability

## Prerequisites

- Node.js `20+`
- npm `10+`
- Clerk app and publishable key
- Convex deployment configured
- Vercel project (for production hosting)

## Environment Variables

Use `.env.local` for local development:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_dGVuZGVyLWNoZWV0YWgtNzMuY2xlcmsuYWNjb3VudHMuZGV2JA
CLERK_FRONTEND_API_URL=https://tender-cheetah-73.clerk.accounts.dev

VITE_CONVEX_URL=https://hardy-horse-294.eu-west-1.convex.cloud
CONVEX_DEPLOYMENT=dev:hardy-horse-294
VITE_CONVEX_SITE_URL=https://hardy-horse-294.eu-west-1.convex.site

# Used by Convex httpAction CORS for export downloads
CLIENT_ORIGIN=https://modern-finance-dashboard.vercel.app/
```

Vercel environment scopes should use the same values for `Development`, `Preview`, and `Production` unless you are splitting deployments.

## Local Development

Install and run:

```bash
npm install
npm run dev
```

Optional Convex workflows:

```bash
npm run convex:dev
npm run convex:codegen
npm run convex:deploy
```

## Quality Gates

Use these before deploy:

```bash
npx tsc -p tsconfig.app.json --noEmit
npm run lint
npm run build
```

## Production Build + Preview

```bash
npm run build
npm run preview
```

## Vercel Deployment

This repo includes `vercel.json` with:

- SPA rewrites for deep links
- immutable caching for hashed static assets
- no-cache headers for `index.html`, `sw.js`, and `manifest.webmanifest`
- baseline security headers

Deploy:

```bash
vercel deploy --prod
```

Recommended Vercel project settings:

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

Add the same env vars in Vercel Project Settings (`Development`, `Preview`, `Production`).

## SEO Setup (Implemented)

The app includes:

- canonical URL
- Open Graph and Twitter tags
- JSON-LD `WebApplication` schema
- `robots.txt`
- `sitemap.xml`
- semantic signed-out landing page content

Files:

- `index.html`
- `public/robots.txt`
- `public/sitemap.xml`

## Performance Setup (Implemented)

- Code splitting for authenticated workspace tabs (lazy-loaded modules)
- Lazy load for print report dialog
- Optimized Rollup manual chunks for major dependency groups
- Font loading moved from CSS `@import` to `<link rel="preconnect/stylesheet">`
- PWA caching strategy tuned via Workbox runtime caching

Primary config:

- `vite.config.ts`
- `src/components/dashboard/finance-dashboard.tsx`
- `index.html`

## PWA Behavior

- Install prompt surfaced via in-app toast when `beforeinstallprompt` is available
- Update flow is user-driven (`registerType: "prompt"`)
- Persistent toast for new version with refresh action
- Notification bell shows update readiness and read/unread state integration

Core files:

- `src/components/pwa/pwa-status.tsx`
- `src/components/pwa/pwa-reliability-provider.tsx`

## Multi-Currency + Data Integrity

- Display-currency conversion with locale formatting
- FX policy visibility in dashboard
- Convex data ownership/auth checks and guardrails
- User-scoped data access through Clerk-authenticated Convex flows

## Convex Schema Discipline

Project includes schema alignment artifacts:

- `convex/schema.ts`
- `convex/schema-alignment.lock.json`
- `convex/schema.index-catalog.json`

Recommended workflow:

1. Align local schema to deployment first
2. Run codegen/type checks
3. Deploy schema only when lock/catalog are consistent with intended changes

## Troubleshooting

- Blank app / env error:
  - Verify `.env.local` variables and restart Vite
- Clerk signed in but Convex auth missing:
  - Verify Clerk JWT template (`convex`) and Convex auth config
- PWA update not appearing:
  - Build and redeploy, then reopen app and wait for `needRefresh` trigger
- Deep-link 404 on Vercel:
  - Ensure `vercel.json` rewrites are present in deployed project

## Security Notes

- Never commit secrets to git
- Use Vercel encrypted env vars for deployment
- Keep Clerk/Convex origins strict and CORS aligned (`CLIENT_ORIGIN`)

## License

Private project.
# Finance-OS
