/**
 * SafeYield History Worker — serves 20 years of price & dividend data from KV.
 *
 * KV key format:
 *   "AAPL" → { s: "AAPL", t: "stock", r: 2, p: [...], d: [...] }
 *   "_tickers" → ["AAPL", "MSFT", ...] (index of all available tickers)
 *
 * Routes:
 *   GET /history/:ticker   → full entry (prices + dividends)
 *   GET /prices/:ticker    → just prices array
 *   GET /dividends/:ticker → just dividends array
 *   GET /tickers           → list all available tickers
 *   GET /health            → health check
 */

const ALLOWED_ORIGINS = [
  "https://safeyield.pages.dev",
  "https://safeyield.app",
  "https://www.safeyield.app",
  "http://localhost:5173",
  "http://localhost:4173",
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const path = url.pathname;

    try {
      // Health check
      if (path === "/health") {
        return json({ ok: true, service: "safeyield-history", kv: !!env.HISTORY }, 200, origin);
      }

      // List all tickers
      if (path === "/tickers") {
        const tickerList = await env.HISTORY.get("_tickers", "json");
        if (!tickerList) {
          return json({ error: "Ticker index not found" }, 404, origin);
        }
        return json({ tickers: tickerList, count: tickerList.length }, 200, origin);
      }

      // Validate ticker format
      const tickerMatch = path.match(/^\/(history|prices|dividends)\/([A-Z0-9.]{1,10})$/i);
      if (!tickerMatch) {
        return json({ error: "Invalid route. Use /history/:ticker, /prices/:ticker, /dividends/:ticker, or /tickers" }, 400, origin);
      }

      const route = tickerMatch[1];
      const ticker = tickerMatch[2].toUpperCase();

      // Fetch from KV
      const entry = await env.HISTORY.get(ticker, "json");
      if (!entry) {
        return json({ error: `No data for ${ticker}` }, 404, origin);
      }

      // Return based on route
      if (route === "prices") {
        return json({ s: entry.s, t: entry.t, r: entry.r, p: entry.p }, 200, origin);
      }
      if (route === "dividends") {
        return json({ s: entry.s, t: entry.t, r: entry.r, d: entry.d }, 200, origin);
      }
      // "history" — return everything
      return json(entry, 200, origin);

    } catch (err) {
      return json({ error: "Internal error: " + err.message }, 500, origin);
    }
  },
};
