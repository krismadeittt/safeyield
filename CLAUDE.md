# SafeYield

Dividend intelligence dashboard — helps investors analyze dividend stocks/ETFs, track portfolios, and simulate DRIP reinvestment.

## Architecture

**Frontend:** Vite + React 19 app (`src/`)
- Custom SVG charting (no chart library), dark/light theme via CSS variables
- Google Fonts: DM Sans, JetBrains Mono
- Built with `npm run build` → `dist/`
- Deployed on **Cloudflare Pages** (`safeyield.pages.dev`)

**Backend:** Cloudflare Workers (`worker/`)
- **API Worker** (`worker/index.js`): Proxies EODHD financial API + D1 database
  - Deployed at `safeyield-api.kisoarmicmusic.workers.dev`
  - EODHD API key stored as Cloudflare secret: `EODHD_KEY`
  - Cron: `30 21 * * 1-5` (weekday snapshots)
- **History Worker** (`worker/history-kv/`): KV-based historical data
  - Deployed at `safeyield-history.kisoarmicmusic.workers.dev`

**Auth:** Clerk (JWKS URL in worker vars)

## Deployment

```bash
# Frontend
npm run build
npx wrangler pages deploy dist --project-name safeyield

# API Worker
cd worker && npx wrangler deploy

# History Worker
cd worker/history-kv && npx wrangler deploy
```

GitHub Actions (`.github/workflows/deploy-worker.yml`) auto-deploys workers on push to `worker/**` on main. Uses `CF_API_TOKEN` secret + wrangler v4.70.0.

## Workflow Rules

- **NEVER push directly to main.** Always create a feature branch + PR.
- Run `coderabbit review --base-commit <hash> --plain` locally after pushing PR branch.
- Tell user CodeRabbit findings BEFORE applying fixes.
- Build + test (`npm run build && npx vitest run`) before every commit.
- 369 tests as of 2025-03-05.

## Worker API Routes

| Route | Purpose |
|-------|---------|
| `/health` | Health check, returns available routes |
| `/quote` | Delayed quote (15-min) for a single ticker |
| `/batch` | Delayed quotes (15-min) for multiple tickers |
| `/fundamentals` | Full fundamentals data for one ticker |
| `/batch-fundamentals` | Fundamentals for up to 20 tickers |
| `/search` | Ticker/company search (limit 10) |
| `/history` | Monthly EOD prices for a ticker (last 5 years) |
| `/history-batch` | Monthly prices for up to 10 tickers |
| `/div-history-batch` | Dividend history for multiple tickers |

All routes support CORS for: `safeyield.pages.dev`, `localhost:3000`, `localhost:5173`.

## Project Structure

```
SafeYield/
├── src/                    ← Frontend source (React + Vite)
│   ├── api/                ← API client + data processing (history.js, snapshots.js)
│   ├── components/charts/  ← Custom SVG chart system
│   │   ├── HistoricalProjectedChart.jsx  ← Main chart container
│   │   └── chart/
│   │       ├── ChartBars.jsx      ← SVG bar renderer
│   │       ├── ChartScrubber.jsx  ← Zoom scrubber bar
│   │       └── useChartZoom.js    ← Shared zoom state hook
│   ├── screens/            ← Page components (Dashboard.jsx)
│   ├── styles/global.css   ← Theme variables + global styles
│   └── hooks/              ← Custom hooks (useIsMobile, etc.)
├── worker/                 ← API Worker (Cloudflare)
│   └── history-kv/         ← History Worker (Cloudflare)
├── dist/                   ← Built output (deploy to Pages)
├── .github/workflows/      ← CI (deploy-worker.yml)
├── CLAUDE.md               ← This file
└── Old Demo/               ← Pre-V1 files (backup/reference)
```

## Chart System

The chart system is custom SVG — no charting library.

**Key files:**
- `useChartZoom.js`: Shared zoom state between portfolio + dividend charts. Manages `viewRange [startIdx, endIdx]`. Supports drag-to-select, scrubber API, default ranges per granularity, double-click reset.
- `ChartScrubber.jsx`: Zoom scrubber bar with mini bar preview, draggable handles, center-drag pan. Uses pixel-delta approach for stable dragging (not SVG rect re-reads).
- `ChartBars.jsx`: SVG bar renderer. Stacked bars (noDrip + DRIP bonus) for portfolio, single bars for dividends. Slices visible data from zoom.viewRange.
- `HistoricalProjectedChart.jsx`: Main container (~800 lines). Wires zoom, data, layout, tooltips, granularity buttons, historical range, data source toggle.

**Granularity:** daily / weekly / monthly / yearly — set manually via buttons (no auto-switching).

**Default zoom ranges:** daily=63pts (~3mo), weekly=52pts (~1yr), monthly/yearly=full.

**Theme colors (CSS vars):**
- Historical bars: `--chart-hist` (base), `--chart-hist-bright` (top/hover)
- Projected bars: `--chart-proj` (base), `--chart-proj-bright` (top/hover)
- Dark mode bg: `--bg-dark: #040c18` — projected colors must be bright enough to see

## Recent Changes (reverse chronological)

### PR #11 — Fix scrubber drag, clipping, coordinates
- Scrubber handles: pixel-delta drag instead of pxToIdx(clientX) which drifted
- useChartZoom: padLRef so pxToIdx subtracts left padding
- selectionPx stored as chart-area-relative coordinates
- overflow:hidden on both chart SVGs
- Scrubber: visible region highlight, increased dimmed overlay opacity

### PR #10 — Chart overhaul: scrubber zoom, remove auto-granularity
- Removed scroll wheel/touchpad zoom (conflicted with page scroll)
- Removed auto-granularity switching
- Added ChartScrubber.jsx (new file)
- Rewrote useChartZoom.js (drag-to-select, scrubber API, default ranges)
- Brightened dark-mode projected bar colors

### PR #9 — CodeRabbit fixes: stale closure, effect deps
### PR #4-8 — Chart fixes, CI/CD fixes, workflow dispatch
### PR #3 — Daily snapshots + charts
### PR #2 — DRIP display fixes
### PR #1 — DRIP calculation fix
