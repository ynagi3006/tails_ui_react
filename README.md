# Tails UI (React)

SPA rebuild of [tails_ui](../tails_ui) using **React 19**, **Vite 8**, **Tailwind CSS v4**, and **shadcn/ui** (style: `radix-nova`, icons: Lucide).

## Prerequisites

- Node 20+ recommended

## Setup

```bash
cd tails_ui_react
npm install
cp .env.example .env
# Edit .env: set VITE_TAILS_API_URL (Tails API origin, e.g. http://127.0.0.1:8000).
# Optional: VITE_TAILS_CLASSIC_UI_ORIGIN for links to Jinja report/metric detail pages.
npm run dev
```

Use the header **Dev identity** popover to set the same `localStorage` keys as `tails_ui` (`tailsDevEmail`, `tailsDevSub`, `tailsOktaAccessToken`). **Save** / **Test** hits `/users/me/principal` and `/users/me` and refreshes **Admin** in the Docs menu when `is_admin` is true.

## Scripts

| Command         | Description              |
| --------------- | ------------------------ |
| `npm run dev`   | Vite dev server          |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview production build |
| `npm run lint`  | ESLint                   |

## shadcn/ui

Configuration lives in [`components.json`](./components.json). Add components:

```bash
npx shadcn@latest add dialog
```

Installed so far: `button`, `card`, `separator`, `dropdown-menu`.

## Project layout

- `src/components/ui/` — shadcn primitives
- `src/components/layout/AppShell.tsx` — top nav aligned with classic Tails (Home, Metrics, Reports, Explore, Report Builder, Docs)
- `src/pages/HomePage.tsx` — report library (filters, search, favorites, pagination)
- `src/pages/ReportsPage.tsx` — reports table + search + status filter
- `src/pages/MetricsPage.tsx` — metrics table + Airflow failed filter + search
- `src/lib/api.ts` — `apiFetchJson` + classic UI deep links
- `src/pages/PlaceholderPage.tsx` — stub for routes not yet ported
- `src/config/env.ts` — `VITE_TAILS_API_URL` helper

## Next steps

- Port report/metric detail, explore, report builder, and admin flows in React (or keep deep-linking to classic UI).
- Add toast/error UX and TanStack Query if list views grow more complex.
