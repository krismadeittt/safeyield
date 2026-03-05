/**
 * SafeYield API Worker
 * Routes: /health  /quote  /batch  /fundamentals  /search  /user/*
 * Set secret: EODHD_KEY in Cloudflare Workers → Settings → Variables
 */

import { verifyClerkToken } from './auth.js';
import {
  getOrCreateUser, updateUserProfile,
  getHoldings, saveHoldings, upsertHolding, deleteHolding,
  getWatchlist, addToWatchlist, removeFromWatchlist,
  saveProcessedState,
  getFundamentals, saveFundamentals,
  getPriceHistory, savePriceHistory, getLatestPriceMonth,
  getDividendHistory, saveDividendHistory, getLatestDividendDate,
  getSnapshots, getLatestSnapshot, saveSnapshots, deleteSnapshots,
  getDailyPrices, saveDailyPrices, getCachedPriceDates,
  getAllUsersWithHoldings, getAllHoldingsGrouped,
} from './db.js';
import { parseFundamentals, sf, round, quarterly, annual, computeG5, computeStreak, buildAnnualHistory } from './parse.js';

const EODHD_BASE = "https://eodhd.com/api";

// ── KV cache helpers ──
async function kvGet(env, key) {
  if (!env.CACHE) return null;
  var raw = await env.CACHE.get(key);
  return raw ? JSON.parse(raw) : null;
}

async function kvPut(env, key, data, ttl) {
  if (!env.CACHE) return;
  await env.CACHE.put(key, JSON.stringify(data), { expirationTtl: ttl });
}

// ── In-flight dedup map for fundamentals requests ──
var inflight = new Map();

function dedupedFetchFundamentals(ticker, key, env) {
  if (inflight.has(ticker)) return inflight.get(ticker);
  var p = kvCachedFetchFundamentals(ticker, key, env).finally(function() {
    inflight.delete(ticker);
  });
  inflight.set(ticker, p);
  return p;
}

var FD_SCHEMA_VERSION = 3; // Bump to invalidate stale cache missing new fields

async function kvCachedFetchFundamentals(ticker, key, env) {
  // 1. KV cache (fast, 12hr TTL)
  var cached = await kvGet(env, "fd:" + ticker);
  if (cached && cached._v === FD_SCHEMA_VERSION) return cached;
  // 2. D1 permanent store (7-day freshness)
  if (env.DB) {
    try {
      var d1Data = await getFundamentals(env.DB, ticker, 7);
      if (d1Data && d1Data._v === FD_SCHEMA_VERSION) {
        await kvPut(env, "fd:" + ticker, d1Data, 43200);
        return d1Data;
      }
    } catch (e) { /* D1 read failed, fall through to EODHD */ }
  }
  // 3. EODHD API (last resort)
  var raw = await fetchFundamentals(ticker, key);
  var parsed = parseFundamentals(raw);
  parsed.ticker = ticker;
  parsed._v = FD_SCHEMA_VERSION;
  await kvPut(env, "fd:" + ticker, parsed, 43200);
  // Save back to D1 for future requests
  if (env.DB) {
    try { await saveFundamentals(env.DB, ticker, parsed); } catch (e) { console.error("D1 fundamentals write failed:", ticker, e.message); }
  }
  return parsed;
}

function cors(origin) {
  const allowed = [
    "https://justasite.pages.dev",
    "https://safeyield.pages.dev",
    "http://localhost:3000",
    "http://localhost:5173",
  ];
  const isAllowed = allowed.includes(origin)
    || (origin && (origin.endsWith(".justasite.pages.dev") || origin.endsWith(".safeyield.pages.dev")));
  return {
    "Access-Control-Allow-Origin":  isAllowed ? origin : "",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age":       "86400",
  };
}

function json(data, origin, status, cache) {
  status = status || 200;
  cache  = cache  || 60;
  return new Response(JSON.stringify(data), {
    status: status,
    headers: Object.assign({
      "Content-Type":  "application/json",
      "Cache-Control": "public, max-age=" + cache + ", s-maxage=" + cache,
    }, cors(origin)),
  });
}

function err(msg, origin, status) {
  return json({ error: msg }, origin, status || 400, 0);
}

var TICKER_RE = /^[A-Z]{1,5}(\.[A-Z]{1,4})?$/;

function validTicker(t) {
  return TICKER_RE.test(t);
}

function toEOD(t) {
  return t.includes(".") ? t : t + ".US";
}

function stripEx(code) {
  return code ? code.replace(/\.[A-Z0-9]+$/, "") : code;
}

async function fetchPrices(tickers, key) {
  var codes   = tickers.map(toEOD);
  var primary = codes[0];
  var extra   = codes.slice(1).join(",");
  var url     = EODHD_BASE + "/real-time/" + primary + "?api_token=" + key + "&fmt=json";
  if (extra) url += "&s=" + encodeURIComponent(extra);
  var r = await fetch(url);
  if (!r.ok) throw new Error("EODHD price " + r.status);
  var d = await r.json();
  return Array.isArray(d) ? d : [d];
}

async function fetchFundamentals(ticker, key) {
  var code = toEOD(ticker);
  var url  = EODHD_BASE + "/fundamentals/" + code + "?api_token=" + key;
  var r    = await fetch(url);
  if (!r.ok) throw new Error("EODHD fundamentals " + r.status);
  return r.json();
}

// parseFundamentals, sf, round, quarterly, annual, computeG5, computeStreak, buildAnnualHistory
// — all imported from ./parse.js


function normPrice(d) {
  var price  = parseFloat(d.close || d.open || 0) || 0;
  var change = parseFloat(d.change_p || 0) || 0;
  return {
    ticker: stripEx(d.code),
    price:  parseFloat(price.toFixed(2)),
    change: parseFloat(change.toFixed(3)),
    volume: d.volume || null,
  };
}

export default {
  // Daily cron: take portfolio snapshots for all users
  async scheduled(event, env) {
    var today = new Date().toISOString().slice(0, 10);
    var dayOfWeek = new Date().getUTCDay(); // 0=Sun, 6=Sat
    if (dayOfWeek === 0 || dayOfWeek === 6) return; // skip weekends

    var KEY = env.EODHD_KEY;
    var db = env.DB;
    if (!KEY || !db) return;

    try {
      // 1. Get all users with holdings + their cash balances
      var users = await getAllUsersWithHoldings(db);
      if (!users.length) return;

      // 2. Get all holdings grouped by user
      var holdingsGrouped = await getAllHoldingsGrouped(db);

      // 3. Collect all unique tickers
      var allTickers = new Set();
      Object.values(holdingsGrouped).forEach(function(hArr) {
        hArr.forEach(function(h) { allTickers.add(h.ticker); });
      });
      var tickerArr = Array.from(allTickers);

      // 4. Fetch today's prices — check D1 cache first
      var priceMap = {}; // ticker → close price
      var cached = await getDailyPrices(db, tickerArr, today, today);
      cached.forEach(function(r) { priceMap[r.ticker] = r.close; });
      var missing = tickerArr.filter(function(t) { return !priceMap[t]; });

      // Fetch missing from EODHD in chunks of 20
      for (var ci = 0; ci < missing.length; ci += 20) {
        var chunk = missing.slice(ci, ci + 20);
        var fetchPromises = chunk.map(function(t) {
          var code = t.includes(".") ? t : t + ".US";
          var url = EODHD_BASE + "/eod/" + code + "?api_token=" + KEY + "&fmt=json&period=d&from=" + today + "&to=" + today;
          return fetch(url)
            .then(function(r) { return r.ok ? r.json() : []; })
            .then(function(d) {
              if (Array.isArray(d) && d.length > 0) {
                priceMap[t] = parseFloat(d[0].close || 0);
              }
            })
            .catch(function() {});
        });
        await Promise.all(fetchPromises);
      }

      // Save new prices to D1 cache
      var newPrices = missing.filter(function(t) { return priceMap[t]; }).map(function(t) {
        return { ticker: t, date: today, close: priceMap[t], adj_close: priceMap[t] };
      });
      if (newPrices.length > 0) {
        await saveDailyPrices(db, newPrices).catch(function() {});
      }

      // 5. Build snapshot for each user
      for (var ui = 0; ui < users.length; ui++) {
        var userId = users[ui].user_id;
        var cashBalance = users[ui].cash_balance || 0;
        var userHoldings = holdingsGrouped[userId] || [];
        if (!userHoldings.length) continue;

        var holdingsValue = 0;
        var holdingsSnap = [];
        userHoldings.forEach(function(h) {
          var price = priceMap[h.ticker] || 0;
          var value = price * (h.shares || 0);
          holdingsValue += value;
          holdingsSnap.push({
            t: h.ticker,
            s: h.shares || 0,
            p: Math.round(price * 100) / 100,
            v: Math.round(value * 100) / 100,
            d: 0,
          });
        });

        var snapshot = {
          date: today,
          total_value: Math.round((holdingsValue + cashBalance) * 100) / 100,
          cash_value: Math.round(cashBalance * 100) / 100,
          holdings_value: Math.round(holdingsValue * 100) / 100,
          total_div_income: 0,
          holdings_snapshot: JSON.stringify(holdingsSnap),
        };

        await saveSnapshots(db, userId, [snapshot]).catch(function(e) {
          console.error("Snapshot save failed for user", userId, e.message);
        });
      }

      console.log("Cron: snapshots taken for " + users.length + " users on " + today);
    } catch (cronErr) {
      console.error("Cron error:", cronErr.message);
    }
  },

  async fetch(request, env) {
    var origin = request.headers.get("Origin") || "";

    try {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    var KEY = env.EODHD_KEY;
    if (!KEY) {
      return err("API key not configured", origin, 500);
    }

    var reqUrl = new URL(request.url);
    var path   = reqUrl.pathname.replace(/\/$/, "");

    if (path === "/health" || path === "") {
      return json({ ok: true, ts: Date.now(), routes: ["/quote","/price","/batch","/batch-fundamentals","/fundamentals","/search","/history","/history-batch"] }, origin, 200, 0);
    }


    if (path === "/quote") {
      var symbol = (reqUrl.searchParams.get("symbol") || "").toUpperCase().trim();
      if (!symbol) return err("symbol required", origin);
      if (!validTicker(symbol)) return err("invalid ticker format", origin);
      try {
        // Check KV for cached price
        var qCached = await kvGet(env, "price:" + symbol);
        var results = await Promise.all([
          qCached ? Promise.resolve(null) : fetchPrices([symbol], KEY),
          dedupedFetchFundamentals(symbol, KEY, env).catch(function() { return {}; }),
        ]);
        var p = qCached;
        if (!p) {
          var rows = results[0];
          p = rows[0] ? normPrice(rows[0]) : null;
          if (p) await kvPut(env, "price:" + p.ticker, p, 120);
        }
        var f = results[1];
        var divYield  = f.divYield;
        var annualDiv = f.annualDiv;
        var price = p ? p.price : 0;
        if (price > 0 && annualDiv != null && divYield == null) divYield  = (annualDiv / price) * 100;
        if (price > 0 && divYield  != null && annualDiv == null) annualDiv = price * (divYield / 100);
        return json({ result: {
          ticker:     symbol,
          name:       f.name    || symbol,
          sector:     f.sector  || null,
          price:      price,
          change:     p ? p.change : 0,
          divYield:   divYield  != null ? parseFloat(divYield.toFixed(3))  : null,
          annualDiv:  annualDiv != null ? parseFloat(annualDiv.toFixed(4)) : null,
          payout:     f.payout     != null ? f.payout : null,
          g5:         f.g5         != null ? f.g5 : null,
          streak:     f.streak     != null ? f.streak : null,
          marketCap:  f.marketCap  || null,
          week52High: f.week52High || null,
          week52Low:  f.week52Low  || null,
        }}, origin);
      } catch (e) {
        return err("Quote failed: " + e.message, origin, 502);
      }
    }

    // ── /price — price-only fetch (no fundamentals) ──
    if (path === "/price") {
      var pSym = (reqUrl.searchParams.get("symbol") || "").toUpperCase().trim();
      if (!pSym) return err("symbol required", origin);
      if (!validTicker(pSym)) return err("invalid ticker format", origin);
      try {
        var pCached = await kvGet(env, "price:" + pSym);
        if (pCached) return json({ result: pCached }, origin, 200, 60);
        var pRows = await fetchPrices([pSym], KEY);
        var pData = pRows[0] ? normPrice(pRows[0]) : null;
        if (pData) await kvPut(env, "price:" + pData.ticker, pData, 120);
        return json({ result: pData }, origin, 200, 60);
      } catch (e) {
        return err("Price failed: " + e.message, origin, 502);
      }
    }

    if (path === "/batch") {
      var raw = (reqUrl.searchParams.get("symbols") || "").toUpperCase().trim();
      if (!raw) return err("symbols required", origin);
      var tickers = Array.from(new Set(raw.split(",").map(function(s) { return s.trim(); }).filter(Boolean))).slice(0, 50);
      try {
        var bOut = {}, bMisses = [];
        for (var bi = 0; bi < tickers.length; bi++) {
          var bc = await kvGet(env, "price:" + tickers[bi]);
          if (bc) bOut[tickers[bi]] = bc;
          else bMisses.push(tickers[bi]);
        }
        if (bMisses.length > 0) {
          var rows2 = await fetchPrices(bMisses, KEY);
          for (var bj = 0; bj < rows2.length; bj++) {
            var p2 = normPrice(rows2[bj]);
            bOut[p2.ticker] = p2;
            await kvPut(env, "price:" + p2.ticker, p2, 120);
          }
        }
        return json({ results: bOut, count: Object.keys(bOut).length }, origin, 200, 120);
      } catch (e) {
        return err("Batch failed: " + e.message, origin, 502);
      }
    }

    if (path === "/fundamentals") {
      var sym = (reqUrl.searchParams.get("symbol") || "").toUpperCase().trim();
      if (!sym) return err("symbol required", origin);
      if (!validTicker(sym)) return err("invalid ticker format", origin);
      try {
        var data     = await dedupedFetchFundamentals(sym, KEY, env);
        return json({ result: Object.assign({ ticker: sym }, data) }, origin, 200, 21600);
      } catch (e) {
        return err("Fundamentals failed: " + e.message, origin, 502);
      }
    }

    if (path === "/search") {
      var q = (reqUrl.searchParams.get("q") || "").trim();
      if (!q) return err("q required", origin);
      try {
        var sCacheKey = "search:" + q.toLowerCase();
        var sCached = await kvGet(env, sCacheKey);
        if (sCached) return json({ results: sCached }, origin, 200, 300);
        var r2 = await fetch(EODHD_BASE + "/search/" + encodeURIComponent(q) + "?api_token=" + KEY + "&limit=10&fmt=json");
        if (!r2.ok) throw new Error("Search " + r2.status);
        var data2   = await r2.json();
        var results2 = (Array.isArray(data2) ? data2 : []).map(function(item) {
          return { ticker: item.Code, exchange: item.Exchange, name: item.Name, type: item.Type };
        });
        await kvPut(env, sCacheKey, results2, 3600);
        return json({ results: results2 }, origin, 200, 300);
      } catch (e) {
        return err("Search failed: " + e.message, origin, 502);
      }
    }

    // ── /batch-fundamentals — fetch fundamentals for up to 20 tickers at once ──
    if (path === "/batch-fundamentals") {
      var bfRawSyms = (reqUrl.searchParams.get("symbols") || "").toUpperCase().trim();
      if (!bfRawSyms) return err("symbols required", origin);
      var bfSyms = Array.from(new Set(
        bfRawSyms.split(",").map(function(t) { return t.trim(); }).filter(Boolean)
      )).slice(0, 20);

      try {
        var bfResults = {};
        var bfPromises = bfSyms.map(function(bfSym) {
          return dedupedFetchFundamentals(bfSym, KEY, env)
            .then(function(bfParsed) {
              bfResults[bfSym] = Object.assign({ ticker: bfSym }, bfParsed);
            })
            .catch(function(bfErr) {
              bfResults[bfSym] = { ticker: bfSym, error: bfErr.message };
            });
        });
        await Promise.all(bfPromises);
        return json({ results: bfResults, count: Object.keys(bfResults).length }, origin, 200, 43200);
      } catch (bfCatchErr) {
        return err("Batch fundamentals failed: " + bfCatchErr.message, origin, 502);
      }
    }


    // ── /history — monthly EOD prices for a ticker ──────────────
    if (path === "/history") {
      var hTicker = reqUrl.searchParams.get("ticker") || "";
      if (!hTicker) return err("ticker param required", origin, 400);
      try {
        var hTickerUp = hTicker.toUpperCase();
        // 1. KV cache
        var hCached = await kvGet(env, "hist:" + hTickerUp);
        if (hCached) return json({ ticker: hTicker, prices: hCached }, origin, 200, 86400);
        // 2. D1 permanent store
        if (env.DB) {
          try {
            var d1Prices = await getPriceHistory(env.DB, hTickerUp);
            if (d1Prices && d1Prices.length > 0) {
              var hD1Arr = d1Prices.map(function(r) { return [r.month, r.price]; });
              // Check if we need to append new months from EODHD
              var latestMonth = d1Prices[d1Prices.length - 1].month;
              var currentMonth = new Date().toISOString().slice(0, 7);
              if (latestMonth < currentMonth) {
                // Fetch only new months from EODHD
                try {
                  var hNewFrom = latestMonth + "-01";
                  var hCode2 = toEOD(hTickerUp);
                  var hUrl2 = EODHD_BASE + "/eod/" + hCode2 + "?api_token=" + KEY + "&fmt=json&period=m&from=" + hNewFrom;
                  var hResp2 = await fetch(hUrl2);
                  if (hResp2.ok) {
                    var hNew = await hResp2.json();
                    if (Array.isArray(hNew)) {
                      var newRows = [];
                      hNew.forEach(function(d) {
                        var m = d.date ? d.date.slice(0, 7) : null;
                        var p = parseFloat((d.adjusted_close || d.close || 0).toFixed(2));
                        if (m && p > 0 && m > latestMonth) {
                          hD1Arr.push([m, p]);
                          newRows.push({ month: m, price: p });
                        }
                      });
                      if (newRows.length > 0) {
                        try { await savePriceHistory(env.DB, hTickerUp, newRows); } catch (e) {}
                      }
                    }
                  }
                } catch (e) { /* new month fetch failed, serve what we have */ }
              }
              await kvPut(env, "hist:" + hTickerUp, hD1Arr, 86400);
              return json({ ticker: hTicker, prices: hD1Arr }, origin, 200, 86400);
            }
          } catch (e) { /* D1 read failed, fall through */ }
        }
        // 3. EODHD API (no D1 data)
        var hCode = toEOD(hTickerUp);
        var hFrom = "2020-01-01";
        var hTo   = new Date().toISOString().slice(0, 10);
        var hUrl  = EODHD_BASE + "/eod/" + hCode + "?api_token=" + KEY + "&fmt=json&period=m&from=" + hFrom + "&to=" + hTo;
        var hResp = await fetch(hUrl);
        if (!hResp.ok) return err("EODHD history " + hResp.status, origin, 502);
        var hData = await hResp.json();
        if (!Array.isArray(hData)) return json({ ticker: hTicker, prices: [] }, origin, 200, 86400);
        var hPrices = hData.map(function(d) {
          return [d.date.slice(0, 7), parseFloat((d.adjusted_close || d.close || 0).toFixed(2))];
        }).filter(function(d) { return d[1] > 0; });
        await kvPut(env, "hist:" + hTickerUp, hPrices, 86400);
        // Save to D1 for next time
        if (env.DB && hPrices.length > 0) {
          try {
            var priceRows = hPrices.map(function(p) { return { month: p[0], price: p[1] }; });
            await savePriceHistory(env.DB, hTickerUp, priceRows);
          } catch (e) {}
        }
        return json({ ticker: hTicker, prices: hPrices }, origin, 200, 86400);
      } catch (hErr) {
        return err("History fetch failed: " + hErr.message, origin, 502);
      }
    }

    // ── /history-batch — monthly prices for up to 10 tickers ─────────────────
    if (path === "/history-batch") {
      var hbRaw = reqUrl.searchParams.get("symbols") || "";
      var hbSyms = hbRaw.split(",").map(function(s) { return s.trim().toUpperCase(); }).filter(Boolean).slice(0, 10);
      if (!hbSyms.length) return err("symbols param required", origin, 400);
      var hbResults = {}, hbMisses = [];
      // Check KV cache first
      for (var hbi = 0; hbi < hbSyms.length; hbi++) {
        var hbc = await kvGet(env, "hist:" + hbSyms[hbi]);
        if (hbc) hbResults[hbSyms[hbi]] = hbc;
        else hbMisses.push(hbSyms[hbi]);
      }
      // Check D1 for remaining misses
      if (hbMisses.length > 0 && env.DB) {
        var hbD1Hits = [];
        for (var hbd = 0; hbd < hbMisses.length; hbd++) {
          try {
            var hbD1 = await getPriceHistory(env.DB, hbMisses[hbd]);
            if (hbD1 && hbD1.length > 0) {
              var hbArr = hbD1.map(function(r) { return [r.month, r.price]; });
              hbResults[hbMisses[hbd]] = hbArr;
              hbD1Hits.push(hbMisses[hbd]);
              await kvPut(env, "hist:" + hbMisses[hbd], hbArr, 86400);
            }
          } catch (e) {}
        }
        hbMisses = hbMisses.filter(function(s) { return hbD1Hits.indexOf(s) === -1; });
      }
      // Fetch remaining from EODHD
      if (hbMisses.length > 0) {
        var hbFrom = "2020-01-01";
        var hbTo   = new Date().toISOString().slice(0, 10);
        var hbPromises = hbMisses.map(function(hbSym) {
          var hbCode = toEOD(hbSym);
          var hbUrl  = EODHD_BASE + "/eod/" + hbCode + "?api_token=" + KEY + "&fmt=json&period=m&from=" + hbFrom + "&to=" + hbTo;
          return fetch(hbUrl)
            .then(function(r) { return r.json(); })
            .then(function(d) {
              var prices = Array.isArray(d) ? d.map(function(x) {
                return [x.date.slice(0, 7), parseFloat((x.adjusted_close || x.close || 0).toFixed(2))];
              }).filter(function(x) { return x[1] > 0; }) : [];
              hbResults[hbSym] = prices;
              var saves = [kvPut(env, "hist:" + hbSym, prices, 86400)];
              if (env.DB && prices.length > 0) {
                var rows = prices.map(function(p) { return { month: p[0], price: p[1] }; });
                saves.push(savePriceHistory(env.DB, hbSym, rows).catch(function() {}));
              }
              return Promise.all(saves);
            })
            .catch(function() { hbResults[hbSym] = []; });
        });
        await Promise.all(hbPromises);
      }
      return json({ results: hbResults }, origin, 200, 86400);
    }


    // -- /div-history-batch -- dividend history for up to 10 tickers --
    if (path === "/div-history-batch") {
      var dbRaw = reqUrl.searchParams.get("symbols") || "";
      var dbSyms = dbRaw.split(",").map(function(s) { return s.trim().toUpperCase(); }).filter(Boolean).slice(0, 10);
      if (!dbSyms.length) return err("symbols param required", origin, 400);
      var dbResults = {}, dbMisses = [];
      // KV cache first
      for (var dbi = 0; dbi < dbSyms.length; dbi++) {
        var dbc = await kvGet(env, "div:" + dbSyms[dbi]);
        if (dbc) dbResults[dbSyms[dbi]] = dbc;
        else dbMisses.push(dbSyms[dbi]);
      }
      // D1 check for remaining
      if (dbMisses.length > 0 && env.DB) {
        var dbD1Hits = [];
        for (var dbd = 0; dbd < dbMisses.length; dbd++) {
          try {
            var d1Divs = await getDividendHistory(env.DB, dbMisses[dbd]);
            if (d1Divs && d1Divs.length > 0) {
              var divArr = d1Divs.map(function(r) {
                var ym = parseInt(r.date.slice(0,4) + r.date.slice(5,7), 10);
                return [ym, parseFloat(parseFloat(r.amount).toFixed(4))];
              }).filter(function(x) { return x[1] > 0; });
              dbResults[dbMisses[dbd]] = divArr;
              dbD1Hits.push(dbMisses[dbd]);
              await kvPut(env, "div:" + dbMisses[dbd], divArr, 86400);
            }
          } catch (e) {}
        }
        dbMisses = dbMisses.filter(function(s) { return dbD1Hits.indexOf(s) === -1; });
      }
      // EODHD for remaining
      if (dbMisses.length > 0) {
        var dbFrom = reqUrl.searchParams.get("from") || "2020-01-01";
        var dbTo   = reqUrl.searchParams.get("to") || new Date().toISOString().slice(0, 10);
        var dbPromises = dbMisses.map(function(dbSym) {
          var dbCode = toEOD(dbSym);
          var dbUrl  = EODHD_BASE + "/div/" + dbCode + "?api_token=" + KEY + "&fmt=json&from=" + dbFrom + "&to=" + dbTo;
          return fetch(dbUrl)
            .then(function(r) { return r.json(); })
            .then(function(d) {
              var divs = Array.isArray(d) ? d.map(function(x) {
                var ym = parseInt(x.date.slice(0,4) + x.date.slice(5,7), 10);
                return [ym, parseFloat(parseFloat(x.value).toFixed(4))];
              }).filter(function(x) { return x[1] > 0; }) : [];
              dbResults[dbSym] = divs;
              var saves = [kvPut(env, "div:" + dbSym, divs, 86400)];
              // Save raw div data to D1
              if (env.DB && Array.isArray(d) && d.length > 0) {
                var rows = d.filter(function(x) { return x.date && parseFloat(x.value) > 0; })
                  .map(function(x) { return { date: x.date, amount: parseFloat(parseFloat(x.value).toFixed(4)) }; });
                if (rows.length > 0) {
                  saves.push(saveDividendHistory(env.DB, dbSym, rows).catch(function() {}));
                }
              }
              return Promise.all(saves);
            })
            .catch(function() { dbResults[dbSym] = []; });
        });
        await Promise.all(dbPromises);
      }
      return json({ results: dbResults }, origin, 200, 86400);
    }

    // ── /daily-prices — cached daily closing prices ──────────────────────
    if (path === "/daily-prices") {
      var dpRaw = (reqUrl.searchParams.get("symbols") || "").toUpperCase().trim();
      var dpFrom = reqUrl.searchParams.get("from") || "";
      var dpTo = reqUrl.searchParams.get("to") || new Date().toISOString().slice(0, 10);
      if (!dpRaw || !dpFrom) return err("symbols and from params required", origin, 400);
      var dpSyms = dpRaw.split(",").map(function(s) { return s.trim(); }).filter(Boolean).slice(0, 20);
      try {
        // 1. Check D1 cache for existing data
        var dpCached = env.DB ? await getDailyPrices(env.DB, dpSyms, dpFrom, dpTo) : [];
        var dpCachedSet = new Set(dpCached.map(function(r) { return r.ticker + ":" + r.date; }));
        // Build result map
        var dpResults = {};
        dpCached.forEach(function(r) {
          if (!dpResults[r.ticker]) dpResults[r.ticker] = [];
          dpResults[r.ticker].push({ date: r.date, close: r.close, adj_close: r.adj_close });
        });
        // 2. Fetch missing data from EODHD per ticker
        var dpFetches = dpSyms.map(function(dpSym) {
          // Check if we already have full data for this ticker
          var hasSome = dpResults[dpSym] && dpResults[dpSym].length > 0;
          // Find the latest cached date to fetch only new data
          var fetchFrom = dpFrom;
          if (hasSome) {
            var dates = dpResults[dpSym].map(function(r) { return r.date; }).sort();
            var latestCached = dates[dates.length - 1];
            if (latestCached >= dpTo) return Promise.resolve(); // fully cached
            fetchFrom = latestCached; // fetch from day after latest
          }
          var dpCode = toEOD(dpSym);
          var dpUrl = EODHD_BASE + "/eod/" + dpCode + "?api_token=" + KEY + "&fmt=json&period=d&from=" + fetchFrom + "&to=" + dpTo;
          return fetch(dpUrl)
            .then(function(r) { return r.ok ? r.json() : []; })
            .then(function(d) {
              if (!Array.isArray(d)) return;
              var newRows = [];
              d.forEach(function(x) {
                if (!x.date) return;
                var key = dpSym + ":" + x.date;
                if (dpCachedSet.has(key)) return; // already cached
                var row = {
                  date: x.date,
                  close: parseFloat((x.close || 0).toFixed(2)),
                  adj_close: parseFloat((x.adjusted_close || x.close || 0).toFixed(2)),
                };
                if (!dpResults[dpSym]) dpResults[dpSym] = [];
                dpResults[dpSym].push(row);
                newRows.push({ ticker: dpSym, date: x.date, close: row.close, adj_close: row.adj_close });
              });
              // Save new data to D1 permanently
              if (env.DB && newRows.length > 0) {
                return saveDailyPrices(env.DB, newRows).catch(function() {});
              }
            })
            .catch(function() { if (!dpResults[dpSym]) dpResults[dpSym] = []; });
        });
        await Promise.all(dpFetches);
        // Sort each ticker's data by date
        Object.keys(dpResults).forEach(function(t) {
          dpResults[t].sort(function(a, b) { return a.date.localeCompare(b.date); });
        });
        return json({ results: dpResults }, origin, 200, 300);
      } catch (dpErr) {
        return err("Daily prices failed: " + dpErr.message, origin, 502);
      }
    }

    // ── Protected /user/* routes ───────────────────────────────────────────
    if (path.startsWith("/user/")) {
      var auth = await verifyClerkToken(request, env);
      if (!auth) return err("Unauthorized", origin, 401);

      var db = env.DB;
      var method = request.method;

      // Ensure user record exists for all /user/* routes
      await getOrCreateUser(db, auth.userId, auth.email);

      // GET /user/profile
      if (path === "/user/profile" && method === "GET") {
        var user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(auth.userId).first();
        return json({ result: user }, origin, 200, 0);
      }

      // PUT /user/profile
      if (path === "/user/profile" && method === "PUT") {
        var body = await request.json();
        var updated = await updateUserProfile(db, auth.userId, {
          displayName: body.display_name,
          defaultStrategy: body.default_strategy,
          targetBalance: body.target_balance,
          cashBalance: body.cash_balance,
          dripEnabled: body.drip_enabled,
          lastProcessedAt: body.last_processed_at,
          vizType: body.viz_type,
          cashApy: body.cash_apy,
          cashCompounding: body.cash_compounding,
        });
        return json({ result: updated }, origin, 200, 0);
      }

      // GET /user/holdings
      if (path === "/user/holdings" && method === "GET") {
        var h = await getHoldings(db, auth.userId);
        return json({ result: h }, origin, 200, 0);
      }

      // PUT /user/holdings (full sync)
      if (path === "/user/holdings" && method === "PUT") {
        var hBody = await request.json();
        await saveHoldings(db, auth.userId, hBody.holdings || []);
        return json({ ok: true }, origin, 200, 0);
      }

      // POST /user/holdings (upsert single)
      if (path === "/user/holdings" && method === "POST") {
        var uBody = await request.json();
        await upsertHolding(db, auth.userId, uBody);
        return json({ ok: true }, origin, 200, 0);
      }

      // DELETE /user/holdings/:ticker
      if (path.startsWith("/user/holdings/") && method === "DELETE") {
        var delTicker = path.split("/user/holdings/")[1].toUpperCase();
        await deleteHolding(db, auth.userId, delTicker);
        return json({ ok: true }, origin, 200, 0);
      }

      // POST /user/processed-state — save catch-up results atomically
      if (path === "/user/processed-state" && method === "POST") {
        var psBody = await request.json();
        await saveProcessedState(
          db, auth.userId,
          psBody.holdings || [],
          psBody.cashBalance || 0,
          psBody.lastProcessedAt || new Date().toISOString().substring(0, 10)
        );
        return json({ ok: true }, origin, 200, 0);
      }

      // GET /user/watchlist
      if (path === "/user/watchlist" && method === "GET") {
        var wl = await getWatchlist(db, auth.userId);
        return json({ result: wl }, origin, 200, 0);
      }

      // POST /user/watchlist
      if (path === "/user/watchlist" && method === "POST") {
        var wlBody = await request.json();
        await addToWatchlist(db, auth.userId, wlBody.ticker, wlBody.name);
        return json({ ok: true }, origin, 200, 0);
      }

      // DELETE /user/watchlist/:ticker
      if (path.startsWith("/user/watchlist/") && method === "DELETE") {
        var wlTicker = path.split("/user/watchlist/")[1].toUpperCase();
        await removeFromWatchlist(db, auth.userId, wlTicker);
        return json({ ok: true }, origin, 200, 0);
      }

      // GET /user/snapshots/latest — most recent snapshot
      if (path === "/user/snapshots/latest" && method === "GET") {
        var latestSnap = await getLatestSnapshot(db, auth.userId);
        return json({ result: latestSnap || null }, origin, 200, 0);
      }

      // GET /user/snapshots — fetch range
      if (path === "/user/snapshots" && method === "GET") {
        var snapFrom = reqUrl.searchParams.get("from") || "2000-01-01";
        var snapTo = reqUrl.searchParams.get("to") || new Date().toISOString().slice(0, 10);
        var snapLimit = parseInt(reqUrl.searchParams.get("limit") || "2000", 10);
        var snaps = await getSnapshots(db, auth.userId, snapFrom, snapTo, snapLimit);
        return json({ result: snaps, count: snaps.length }, origin, 200, 0);
      }

      // POST /user/snapshots — save batch
      if (path === "/user/snapshots" && method === "POST") {
        var snapBody = await request.json();
        var snapArr = snapBody.snapshots || [];
        if (snapArr.length === 0) return err("snapshots array required", origin, 400);
        if (snapArr.length > 500) return err("max 500 snapshots per request", origin, 400);
        // Validate each snapshot
        for (var si = 0; si < snapArr.length; si++) {
          if (!snapArr[si].date || !/^\d{4}-\d{2}-\d{2}$/.test(snapArr[si].date)) {
            return err("invalid date format at index " + si, origin, 400);
          }
          if (typeof snapArr[si].holdings_snapshot !== 'string') {
            snapArr[si].holdings_snapshot = JSON.stringify(snapArr[si].holdings_snapshot || []);
          }
        }
        await saveSnapshots(db, auth.userId, snapArr);
        return json({ ok: true, inserted: snapArr.length }, origin, 200, 0);
      }

      // DELETE /user/snapshots — clear all
      if (path === "/user/snapshots" && method === "DELETE") {
        await deleteSnapshots(db, auth.userId);
        return json({ ok: true }, origin, 200, 0);
      }

      return err("Not found", origin, 404);
    }

    return err("Valid routes: /health /quote /batch /batch-fundamentals /fundamentals /search /history /history-batch /div-history-batch /user/*", origin, 404);

    } catch (uncaught) {
      return err("Internal error", origin, 500);
    }
  },
};
