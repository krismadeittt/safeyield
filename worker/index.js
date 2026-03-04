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
} from './db.js';

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

async function kvCachedFetchFundamentals(ticker, key, env) {
  var cached = await kvGet(env, "fd:" + ticker);
  if (cached) return cached;
  var raw = await fetchFundamentals(ticker, key);
  var parsed = parseFundamentals(raw);
  parsed.ticker = ticker;
  await kvPut(env, "fd:" + ticker, parsed, 43200);
  return parsed;
}

function cors(origin) {
  const allowed = [
    "https://justasite.pages.dev",
    "https://safeyield.pages.dev",
    "http://localhost:3000",
    "http://localhost:5173",
  ];
  return {
    "Access-Control-Allow-Origin":  allowed.includes(origin) ? origin : "",
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

function sf(v, scale) {
  scale = scale || 1;
  var n = parseFloat(v);
  return (!isNaN(n) && n !== 0) ? n * scale : null;
}

function round(v, d) {
  return v != null ? parseFloat(v.toFixed(d || 2)) : null;
}

function quarterly(section, field, scale) {
  scale = scale || 1;
  if (!section || typeof section !== "object") return [];
  return Object.entries(section)
    .sort(function(a, b) { return a[0] < b[0] ? -1 : 1; })
    .slice(-20)
    .map(function(entry) {
      var val = sf(entry[1] && entry[1][field], scale);
      return val !== null ? { date: entry[0], value: val } : null;
    })
    .filter(Boolean);
}

function annual(section, field, scale) {
  scale = scale || 1;
  if (!section || typeof section !== "object") return [];
  return Object.entries(section)
    .sort(function(a, b) { return a[0] < b[0] ? -1 : 1; })
    .slice(-12)
    .map(function(entry) {
      var val = sf(entry[1] && entry[1][field], scale);
      return val !== null ? { date: entry[0], value: val } : null;
    })
    .filter(Boolean);
}

function parseFundamentals(raw) {
  if (!raw || typeof raw !== "object") return {};

  var G  = raw.General         || {};
  var H  = raw.Highlights      || {};
  var SD = raw.SplitsDividends || {};
  var ET = raw.ETF_Data        || {};
  var SS = raw.SharesStats     || {};
  var TE = raw.Technicals      || {};
  var FI = raw.Financials      || {};

  var isETF = G.Type === "ETF";

  // Try all dividend yield sources (ETF first, then stock-style fallbacks)
  var divYield = null;
  var etfY = parseFloat(ET.Yield);
  if (!isNaN(etfY) && etfY > 0) divYield = etfY;
  if (divYield == null) {
    var sy = parseFloat(SD.ForwardAnnualDividendYield);
    var hy = parseFloat(H.DividendYield);
    var y2 = (!isNaN(sy) && sy > 0) ? sy : ((!isNaN(hy) && hy > 0) ? hy : null);
    if (y2 !== null) divYield = y2 * 100;
  }

  // Try all annual dividend sources
  var fwd      = parseFloat(SD.ForwardAnnualDividendRate);
  var hlDiv    = parseFloat(H.DividendShare);
  var annualDiv = (!isNaN(fwd) && fwd > 0) ? fwd : ((!isNaN(hlDiv) && hlDiv > 0) ? hlDiv : null);

  var pr     = parseFloat(H.PayoutRatio);
  var payout = (!isNaN(pr) && pr > 0) ? pr * 100 : null;

  var incQ = (FI.Income_Statement && FI.Income_Statement.quarterly) || {};
  var balQ = (FI.Balance_Sheet    && FI.Balance_Sheet.quarterly)    || {};
  var cfQ  = (FI.Cash_Flow        && FI.Cash_Flow.quarterly)        || {};

  var incY = (FI.Income_Statement && FI.Income_Statement.yearly) || {};
  var balY = (FI.Balance_Sheet    && FI.Balance_Sheet.yearly)    || {};
  var cfY  = (FI.Cash_Flow        && FI.Cash_Flow.yearly)        || {};

  var fcfHistory = Object.entries(cfQ)
    .sort(function(a, b) { return a[0] < b[0] ? -1 : 1; })
    .slice(-20)
    .map(function(entry) {
      var row   = entry[1] || {};
      var ocf   = parseFloat(row.totalCashFromOperatingActivities);
      var capex = parseFloat(row.capitalExpenditures);
      if (isNaN(ocf)) return null;
      return { date: entry[0], value: isNaN(capex) ? ocf : ocf + capex };
    })
    .filter(Boolean);

  var netDebtHistory = Object.entries(balQ)
    .sort(function(a, b) { return a[0] < b[0] ? -1 : 1; })
    .slice(-20)
    .map(function(entry) {
      var row  = entry[1] || {};
      var debt = parseFloat(row.shortLongTermDebtTotal || row.longTermDebt || 0);
      var cash = parseFloat(row.cash || 0);
      if (isNaN(debt) && isNaN(cash)) return null;
      return { date: entry[0], value: (isNaN(debt) ? 0 : debt) - (isNaN(cash) ? 0 : cash) };
    })
    .filter(Boolean);

  var ebitHistory = Object.entries(incQ)
    .sort(function(a, b) { return a[0] < b[0] ? -1 : 1; })
    .slice(-20)
    .map(function(entry) {
      var row      = entry[1] || {};
      var ebit     = parseFloat(row.ebit || row.operatingIncome);
      var interest = parseFloat(row.interestExpense || 0);
      if (isNaN(ebit)) return null;
      var coverage = (interest && interest < 0) ? ebit / Math.abs(interest) : null;
      return { date: entry[0], value: ebit, coverage: coverage };
    })
    .filter(Boolean);

  var revenue      = sf(H.RevenueTTM);
  var eps          = sf(H.EarningsShare);
  // Compute payout from annualDiv / EPS if EODHD doesn't provide it
  if (payout == null && annualDiv > 0 && eps > 0) {
    payout = (annualDiv / eps) * 100;
  }
  var epsGrowth    = sf(H.QuarterlyEarningsGrowthYOY,  100);
  var salesGrowth  = sf(H.QuarterlyRevenueGrowthYOY,   100);
  var roe          = sf(H.ReturnOnEquityTTM, 100);
  var roa          = sf(H.ReturnOnAssetsTTM, 100);
  var opMargin     = sf(H.OperatingMarginTTM, 100);
  var profitMargin = sf(H.ProfitMargin, 100);
  var ebitda       = sf(H.EBITDA);
  var sharesOut    = sf(SS.SharesOutstanding, 1 / 1e6);
  var beta         = sf(TE.Beta);

  var fcfTTM      = fcfHistory.slice(-4).reduce(function(a, d) { return a + (d.value || 0); }, 0) || null;
  var fcfMargin   = (revenue && fcfTTM) ? (fcfTTM / revenue) * 100 : null;
  var fcfPerShare = (sharesOut && fcfTTM) ? fcfTTM / (sharesOut * 1e6) : null;
  var fcfPayout   = (annualDiv && sharesOut && fcfTTM && fcfTTM > 0)
    ? (annualDiv * sharesOut * 1e6) / fcfTTM * 100 : null;

  var latestNetDebt    = netDebtHistory.length ? netDebtHistory[netDebtHistory.length - 1].value : null;
  var netDebtToEbitda  = (latestNetDebt != null && ebitda) ? latestNetDebt / ebitda : null;
  var lastEbit         = ebitHistory.length ? ebitHistory[ebitHistory.length - 1] : null;
  var latestCoverage   = lastEbit ? lastEbit.coverage : null;
  var annHist          = buildAnnualHistory(incY, balY, cfY);

  // Fallback: compute annualDiv from DPS history if still missing
  if (annualDiv == null && annHist.dps && annHist.dps.length > 0) {
    var lastDps = annHist.dps[annHist.dps.length - 1].value;
    if (lastDps > 0) annualDiv = lastDps;
  }

  // Fallback: compute divYield from annualDiv and price estimate (52-week midpoint)
  if (divYield == null && annualDiv > 0) {
    var h52 = sf(H["52WeekHigh"]);
    var l52 = sf(H["52WeekLow"]);
    if (h52 && l52) {
      var midPrice = (h52 + l52) / 2;
      divYield = (annualDiv / midPrice) * 100;
    }
  }

  return {
    name:    G.Name   || null,
    sector:  G.Sector || null,
    isETF:   isETF,
    divYield:         round(divYield, 3),
    annualDiv:        round(annualDiv, 4),
    payout:           round(payout, 1),
    marketCap:        H.MarketCapitalization ? Math.round(parseFloat(H.MarketCapitalization) / 1e9) : null, // billions
    week52High:       sf(H["52WeekHigh"]),
    week52Low:        sf(H["52WeekLow"]),
    sharesOut:        sharesOut,
    beta:             beta,
    revenue:          revenue,
    eps:              eps,
    epsGrowth:        round(epsGrowth, 1),
    salesGrowth:      round(salesGrowth, 1),
    roe:              round(roe, 1),
    roa:              round(roa, 1),
    opMargin:         round(opMargin, 1),
    profitMargin:     round(profitMargin, 1),
    ebitda:           ebitda,
    fcfTTM:           fcfTTM,
    fcfMargin:        round(fcfMargin, 1),
    fcfPerShare:      round(fcfPerShare, 4),
    fcfPayout:        round(fcfPayout, 1),
    netDebt:          latestNetDebt,
    netDebtToEbitda:  round(netDebtToEbitda, 2),
    interestCoverage: round(latestCoverage, 2),
    history: {
      revenue:   quarterly(incQ, "totalRevenue"),
      eps:       quarterly(incQ, "dilutedEPS"),
      netIncome: quarterly(incQ, "netIncome"),
      fcf:       fcfHistory,
      netDebt:   netDebtHistory,
      shares:    quarterly(balQ, "commonStockSharesOutstanding", 1 / 1e6),
      ebit:      ebitHistory.map(function(d) { return { date: d.date, value: d.value }; }),
    },
    annualHistory: annHist,
    g5:     annHist.dps ? computeG5(annHist.dps) : null,
    streak: annHist.dps ? computeStreak(annHist.dps) : null,
  };
}

// Compute 5-year DPS CAGR from annual dividend per share data
function computeG5(dps) {
  if (!dps || dps.length < 2) return null;
  // Use last 5 years (or whatever we have, minimum 2)
  var recent = dps.slice(-6); // 6 entries = 5 years of growth
  if (recent.length < 2) return null;
  var first = recent[0].value;
  var last  = recent[recent.length - 1].value;
  if (!first || first <= 0 || !last || last <= 0) return null;
  var years = recent.length - 1;
  var cagr  = (Math.pow(last / first, 1 / years) - 1) * 100;
  return round(cagr, 1);
}

// Compute consecutive years of dividend increases
function computeStreak(dps) {
  if (!dps || dps.length < 2) return 0;
  var streak = 0;
  for (var i = dps.length - 1; i > 0; i--) {
    if (dps[i].value > dps[i - 1].value) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

function buildAnnualHistory(incY, balY, cfY) {
  var revenue = annual(incY, "totalRevenue");
  var netIncome = annual(incY, "netIncome");

  // Compute EPS = netIncome / sharesOutstanding (dilutedEPS not in income stmt)
  var incEntries0 = Object.entries(incY).sort(function(a, b) { return a[0] < b[0] ? -1 : 1; });
  var balEntries0 = Object.entries(balY).sort(function(a, b) { return a[0] < b[0] ? -1 : 1; });
  var sharesMap0 = {};
  balEntries0.forEach(function(e) {
    var s = parseFloat((e[1] || {}).commonStockSharesOutstanding);
    if (!isNaN(s) && s > 0) sharesMap0[e[0]] = s;
  });
  var eps = incEntries0.slice(-12).map(function(entry) {
    var ni = parseFloat((entry[1] || {}).netIncome);
    var s = sharesMap0[entry[0]];
    if (isNaN(ni) || !s) return null;
    return { date: entry[0], value: round(ni / s, 2) };
  }).filter(Boolean);

  // FCF = operating cash flow + capital expenditures (capex is negative)
  var fcf = Object.entries(cfY)
    .sort(function(a, b) { return a[0] < b[0] ? -1 : 1; })
    .slice(-12)
    .map(function(entry) {
      var row = entry[1] || {};
      var ocf = parseFloat(row.totalCashFromOperatingActivities);
      var capex = parseFloat(row.capitalExpenditures);
      if (isNaN(ocf)) return null;
      return { date: entry[0], value: isNaN(capex) ? ocf : ocf + capex };
    })
    .filter(Boolean);

  // Net debt = total debt - cash
  var netDebt = Object.entries(balY)
    .sort(function(a, b) { return a[0] < b[0] ? -1 : 1; })
    .slice(-12)
    .map(function(entry) {
      var row = entry[1] || {};
      var debt = parseFloat(row.shortLongTermDebtTotal || row.longTermDebt || 0);
      var cash = parseFloat(row.cash || 0);
      if (isNaN(debt) && isNaN(cash)) return null;
      return { date: entry[0], value: (isNaN(debt) ? 0 : debt) - (isNaN(cash) ? 0 : cash) };
    })
    .filter(Boolean);

  var shares = annual(balY, "commonStockSharesOutstanding", 1 / 1e6);

  // Margins: operating margin & net margin (computed from revenue and income)
  var margins = Object.entries(incY)
    .sort(function(a, b) { return a[0] < b[0] ? -1 : 1; })
    .slice(-12)
    .map(function(entry) {
      var row = entry[1] || {};
      var rev = parseFloat(row.totalRevenue);
      var opIncome = parseFloat(row.operatingIncome || row.ebit);
      var ni = parseFloat(row.netIncome);
      if (isNaN(rev) || rev === 0) return null;
      return {
        date: entry[0],
        opMargin: !isNaN(opIncome) ? round(opIncome / rev * 100, 1) : null,
        netMargin: !isNaN(ni) ? round(ni / rev * 100, 1) : null,
      };
    })
    .filter(Boolean);

  // ROE = net income / total stockholder equity
  var roeData = [];
  var incEntries = Object.entries(incY).sort(function(a, b) { return a[0] < b[0] ? -1 : 1; });
  var balEntries = Object.entries(balY).sort(function(a, b) { return a[0] < b[0] ? -1 : 1; });
  var balMap = {};
  balEntries.forEach(function(e) { balMap[e[0]] = e[1]; });
  incEntries.slice(-12).forEach(function(entry) {
    var ni = parseFloat((entry[1] || {}).netIncome);
    var bal = balMap[entry[0]] || {};
    var equity = parseFloat(bal.totalStockholderEquity);
    if (!isNaN(ni) && !isNaN(equity) && equity !== 0) {
      roeData.push({ date: entry[0], value: round(ni / equity * 100, 1) });
    }
  });

  // DPS = dividends paid / shares outstanding (both annual)
  var dps = [];
  var cfEntries = Object.entries(cfY).sort(function(a, b) { return a[0] < b[0] ? -1 : 1; });
  var sharesMap = {};
  balEntries.forEach(function(e) {
    var s = parseFloat((e[1] || {}).commonStockSharesOutstanding);
    if (!isNaN(s) && s > 0) sharesMap[e[0]] = s;
  });
  cfEntries.slice(-12).forEach(function(entry) {
    var divPaid = parseFloat((entry[1] || {}).dividendsPaid);
    var s = sharesMap[entry[0]];
    if (!isNaN(divPaid) && s) {
      dps.push({ date: entry[0], value: round(Math.abs(divPaid) / s, 4) });
    }
  });

  return {
    revenue: revenue,
    eps: eps,
    netIncome: netIncome,
    fcf: fcf,
    netDebt: netDebt,
    shares: shares,
    margins: margins,
    roe: roeData,
    dps: dps,
  };
}

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


    // ── /history — monthly EOD prices for a ticker, last 5 years ──────────────
    if (path === "/history") {
      var hTicker = reqUrl.searchParams.get("ticker") || "";
      if (!hTicker) return err("ticker param required", origin, 400);
      try {
        var hCached = await kvGet(env, "hist:" + hTicker.toUpperCase());
        if (hCached) return json({ ticker: hTicker, prices: hCached }, origin, 200, 86400);
        var hCode = toEOD(hTicker);
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
        await kvPut(env, "hist:" + hTicker.toUpperCase(), hPrices, 86400);
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
      for (var hbi = 0; hbi < hbSyms.length; hbi++) {
        var hbc = await kvGet(env, "hist:" + hbSyms[hbi]);
        if (hbc) hbResults[hbSyms[hbi]] = hbc;
        else hbMisses.push(hbSyms[hbi]);
      }
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
              return kvPut(env, "hist:" + hbSym, prices, 86400);
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
      for (var dbi = 0; dbi < dbSyms.length; dbi++) {
        var dbc = await kvGet(env, "div:" + dbSyms[dbi]);
        if (dbc) dbResults[dbSyms[dbi]] = dbc;
        else dbMisses.push(dbSyms[dbi]);
      }
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
              return kvPut(env, "div:" + dbSym, divs, 86400);
            })
            .catch(function() { dbResults[dbSym] = []; });
        });
        await Promise.all(dbPromises);
      }
      return json({ results: dbResults }, origin, 200, 86400);
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
        var updated = await updateUserProfile(db, auth.userId, body.display_name, body.default_strategy, body.target_balance);
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

      return err("Not found", origin, 404);
    }

    return err("Valid routes: /health /quote /batch /batch-fundamentals /fundamentals /search /history /history-batch /div-history-batch /user/*", origin, 404);

    } catch (uncaught) {
      return err("Internal error", origin, 500);
    }
  },
};
