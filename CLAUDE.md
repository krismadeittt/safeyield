# SafeYield

Dividend intelligence dashboard — helps investors analyze dividend stocks/ETFs, track portfolios, and simulate DRIP reinvestment.

## Architecture

**Frontend:** Single-page React 18 app (`index.html`, ~360KB monolithic bundle)
- MUI components, custom SVG charting, dark theme
- Google Fonts: Playfair Display, EB Garamond
- Deployed on **Cloudflare Pages** (`safeyield.pages.dev` / `justasite.pages.dev`)

**Backend:** Cloudflare Worker (`worker/index.js`)
- Proxies the EODHD financial API
- Deployed at `history-workerjs.kisoarmicmusic.workers.dev`
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

All routes support CORS for: `safeyield.pages.dev`, `justasite.pages.dev`, `localhost:3000`, `localhost:5173`.

## Project Structure

```
SafeYield/
├── index.html          ← Production SPA (monolithic React bundle)
├── worker/
│   └── index.js        ← Cloudflare Worker (EODHD API proxy)
├── CLAUDE.md           ← This file
└── Old Code/           ← Original files (backup/reference)
```

## Key Notes

- `index.html` is a fully bundled production build — no build step needed
- The frontend is not yet broken into separate source files (future work)
- `Old Code/worker.js` and `Old Code/worker_1.js` are identical — only one worker exists
- `Old Code/history-worker1.js` is a larger variant (~427KB) kept for reference
