# SafeYield

Dividend intelligence dashboard — helps investors analyze dividend stocks/ETFs, track portfolios, and simulate DRIP reinvestment.

## Architecture

**Frontend:** Vite + React 18 app (`src/`)
- MUI components, custom SVG charting, dark theme
- Google Fonts: Playfair Display, EB Garamond
- Built with `npm run build` → `dist/`
- Deployed on **Cloudflare Pages** (`safeyield.pages.dev`)

**Backend:** Cloudflare Worker (`worker/index.js`)
- Proxies the EODHD financial API + D1 database
- Deployed at `safeyield-api.kisoarmicmusic.workers.dev`
- EODHD API key stored as Cloudflare secret: `EODHD_KEY`

## Worker API Routes

| Route | Purpose |
|-------|---------|
| `/health` | Health check, returns available routes |
| `/quote` | Real-time quote for a single ticker |
| `/batch` | Real-time quotes for multiple tickers |
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
├── src/                ← V1 frontend source (React + Vite)
├── worker/             ← V1 backend (Cloudflare Worker)
├── dist/               ← Built output (deploy to Pages)
├── index.html          ← Vite entry point
├── package.json
├── vite.config.js
├── CLAUDE.md           ← This file
├── .github/            ← CI workflows
├── V2/                 ← Placeholder for future work
└── Old Demo/           ← Pre-V1 files (backup/reference)
```

## Key Notes

- Build with `npm run build`; deploy with `npx wrangler pages deploy dist --project-name safeyield`
- Worker deploy: `cd worker && npx wrangler deploy`
- `Old Demo/` contains the original monolithic HTML and legacy scripts
