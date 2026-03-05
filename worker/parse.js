/**
 * Pure parsing functions extracted from worker/index.js for testability.
 * These are the same functions used in production — worker/index.js imports from here.
 */

export function sf(v, scale) {
  scale = scale || 1;
  var n = parseFloat(v);
  return (!isNaN(n) && n !== 0) ? n * scale : null;
}

export function round(v, d) {
  return v != null ? parseFloat(v.toFixed(d || 2)) : null;
}

export function quarterly(section, field, scale) {
  scale = scale || 1;
  if (!section || typeof section !== "object") return [];
  return Object.entries(section)
    .sort(function(a, b) { return a[0] < b[0] ? -1 : 1; })
    .slice(-80)
    .map(function(entry) {
      var val = sf(entry[1] && entry[1][field], scale);
      return val !== null ? { date: entry[0], value: val } : null;
    })
    .filter(Boolean);
}

export function annual(section, field, scale) {
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

// Compute 5-year DPS CAGR from annual dividend per share data
export function computeG5(dps) {
  if (!dps || dps.length < 2) return null;
  var recent = dps.slice(-6);
  if (recent.length < 2) return null;
  var first = recent[0].value;
  var last  = recent[recent.length - 1].value;
  if (!first || first <= 0 || !last || last <= 0) return null;
  var years = recent.length - 1;
  var cagr  = (Math.pow(last / first, 1 / years) - 1) * 100;
  return round(cagr, 1);
}

// Compute consecutive years of dividend increases
export function computeStreak(dps) {
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

export function buildAnnualHistory(incY, balY, cfY) {
  var revenue = annual(incY, "totalRevenue");
  var netIncome = annual(incY, "netIncome");

  var incEntries0 = Object.entries(incY).sort(function(a, b) { return a[0] < b[0] ? -1 : 1; });
  var balEntries0 = Object.entries(balY).sort(function(a, b) { return a[0] < b[0] ? -1 : 1; });
  var sharesMap0 = {};
  balEntries0.forEach(function(e) {
    var s = parseFloat((e[1] || {}).commonStockSharesOutstanding);
    if (!isNaN(s) && s > 0) sharesMap0[e[0]] = s;
  });
  var eps = incEntries0.slice(-20).map(function(entry) {
    var ni = parseFloat((entry[1] || {}).netIncome);
    var s = sharesMap0[entry[0]];
    if (isNaN(ni) || !s) return null;
    return { date: entry[0], value: round(ni / s, 2) };
  }).filter(Boolean);

  var fcf = Object.entries(cfY)
    .sort(function(a, b) { return a[0] < b[0] ? -1 : 1; })
    .slice(-20)
    .map(function(entry) {
      var row = entry[1] || {};
      var ocf = parseFloat(row.totalCashFromOperatingActivities);
      var capex = parseFloat(row.capitalExpenditures);
      if (isNaN(ocf)) return null;
      return { date: entry[0], value: isNaN(capex) ? ocf : ocf + capex };
    })
    .filter(Boolean);

  var netDebt = Object.entries(balY)
    .sort(function(a, b) { return a[0] < b[0] ? -1 : 1; })
    .slice(-20)
    .map(function(entry) {
      var row = entry[1] || {};
      var debt = parseFloat(row.shortLongTermDebtTotal || row.longTermDebt || 0);
      var cash = parseFloat(row.cash || 0);
      if (isNaN(debt) && isNaN(cash)) return null;
      return { date: entry[0], value: (isNaN(debt) ? 0 : debt) - (isNaN(cash) ? 0 : cash) };
    })
    .filter(Boolean);

  var shares = annual(balY, "commonStockSharesOutstanding", 1 / 1e6);

  var margins = Object.entries(incY)
    .sort(function(a, b) { return a[0] < b[0] ? -1 : 1; })
    .slice(-20)
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

  var roeData = [];
  var incEntries = Object.entries(incY).sort(function(a, b) { return a[0] < b[0] ? -1 : 1; });
  var balEntries = Object.entries(balY).sort(function(a, b) { return a[0] < b[0] ? -1 : 1; });
  var balMap = {};
  balEntries.forEach(function(e) { balMap[e[0]] = e[1]; });
  incEntries.slice(-20).forEach(function(entry) {
    var ni = parseFloat((entry[1] || {}).netIncome);
    var bal = balMap[entry[0]] || {};
    var equity = parseFloat(bal.totalStockholderEquity);
    if (!isNaN(ni) && !isNaN(equity) && equity !== 0) {
      roeData.push({ date: entry[0], value: round(ni / equity * 100, 1) });
    }
  });

  var dps = [];
  var cfEntries = Object.entries(cfY).sort(function(a, b) { return a[0] < b[0] ? -1 : 1; });
  var sharesMap = {};
  balEntries.forEach(function(e) {
    var s = parseFloat((e[1] || {}).commonStockSharesOutstanding);
    if (!isNaN(s) && s > 0) sharesMap[e[0]] = s;
  });
  cfEntries.slice(-20).forEach(function(entry) {
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

export function parseFundamentals(raw) {
  if (!raw || typeof raw !== "object") return {};

  var G  = raw.General         || {};
  var H  = raw.Highlights      || {};
  var SD = raw.SplitsDividends || {};
  var ET = raw.ETF_Data        || {};
  var SS = raw.SharesStats     || {};
  var TE = raw.Technicals      || {};
  var FI = raw.Financials      || {};

  var isETF = G.Type === "ETF";

  var divYield = null;
  var etfY = parseFloat(ET.Yield);
  if (!isNaN(etfY) && etfY > 0) divYield = etfY;
  if (divYield == null) {
    var sy = parseFloat(SD.ForwardAnnualDividendYield);
    var hy = parseFloat(H.DividendYield);
    var y2 = (!isNaN(sy) && sy > 0) ? sy : ((!isNaN(hy) && hy > 0) ? hy : null);
    if (y2 !== null) divYield = y2 * 100;
  }

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
    .slice(-80)
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
    .slice(-80)
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
    .slice(-80)
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

  if (annualDiv == null && annHist.dps && annHist.dps.length > 0) {
    var lastDps = annHist.dps[annHist.dps.length - 1].value;
    if (lastDps > 0) annualDiv = lastDps;
  }

  if (divYield == null && annualDiv > 0) {
    var h52 = sf(H["52WeekHigh"]);
    var l52 = sf(H["52WeekLow"]);
    if (h52 && l52) {
      var midPrice = (h52 + l52) / 2;
      divYield = (annualDiv / midPrice) * 100;
    }
  }

  var VA = raw.Valuation || {};
  var valuation = {
    trailingPE:      sf(VA.TrailingPE),
    forwardPE:       sf(VA.ForwardPE),
    pegRatio:        sf(H.PEGRatio),
    priceSales:      sf(VA.PriceSalesTTM),
    priceBook:       sf(VA.PriceBookMRQ),
    evToRevenue:     sf(VA.EnterpriseValueRevenue),
    evToEbitda:      sf(VA.EnterpriseValueEbitda),
    enterpriseValue: sf(VA.EnterpriseValue),
  };

  var AR = raw.AnalystRatings || {};
  var analyst = {
    rating:     sf(AR.Rating),
    targetPrice: sf(AR.TargetPrice),
    strongBuy:  AR.StrongBuy != null ? parseInt(AR.StrongBuy) : null,
    buy:        AR.Buy != null ? parseInt(AR.Buy) : null,
    hold:       AR.Hold != null ? parseInt(AR.Hold) : null,
    sell:       AR.Sell != null ? parseInt(AR.Sell) : null,
    strongSell: AR.StrongSell != null ? parseInt(AR.StrongSell) : null,
  };

  var technicals = {
    beta:         beta,
    week52High:   sf(TE["52WeekHigh"]),
    week52Low:    sf(TE["52WeekLow"]),
    ma50:         sf(TE["50DayMA"]),
    ma200:        sf(TE["200DayMA"]),
    sharesShort:  sf(TE.SharesShort),
    shortRatio:   sf(TE.ShortRatio),
    shortPercent: sf(TE.ShortPercent),
  };

  var EA = raw.Earnings || {};
  var earningsHist = EA.History || {};
  var earningsSurprises = Object.entries(earningsHist)
    .sort(function(a, b) { return a[0] < b[0] ? -1 : 1; })
    .slice(-80)
    .map(function(entry) {
      var row = entry[1] || {};
      var actual = parseFloat(row.epsActual);
      var est = parseFloat(row.epsEstimate);
      if (isNaN(actual) || isNaN(est)) return null;
      var surprise = est !== 0 ? round((actual - est) / Math.abs(est) * 100, 2) : null;
      return { date: entry[0], epsActual: actual, epsEstimate: est, surprise: surprise };
    })
    .filter(Boolean);

  var trend = EA.Trend || {};
  var trendEntries = Object.entries(trend)
    .sort(function(a, b) { return a[0] < b[0] ? -1 : 1; });
  var estimates = { epsCurrentQ: null, epsNextQ: null, epsCurrentY: null, epsNextY: null,
                    revCurrentY: null, revNextY: null, epsGrowthCurrentY: null, epsGrowthNextY: null };
  trendEntries.forEach(function(entry) {
    var row = entry[1] || {};
    var period = row.period;
    if (period === "0q") {
      estimates.epsCurrentQ = sf(row.earningsEstimateAvg);
    } else if (period === "+1q") {
      estimates.epsNextQ = sf(row.earningsEstimateAvg);
    } else if (period === "0y") {
      estimates.epsCurrentY = sf(row.earningsEstimateAvg);
      estimates.revCurrentY = sf(row.revenueEstimateAvg);
      estimates.epsGrowthCurrentY = sf(row.earningsEstimateGrowth, 100);
    } else if (period === "+1y") {
      estimates.epsNextY = sf(row.earningsEstimateAvg);
      estimates.revNextY = sf(row.revenueEstimateAvg);
      estimates.epsGrowthNextY = sf(row.earningsEstimateGrowth, 100);
    }
  });

  var IT = raw.InsiderTransactions || {};
  var insiders = Object.entries(IT)
    .filter(function(e) { return e[1] && typeof e[1] === "object" && e[1].transactionDate; })
    .sort(function(a, b) { return (b[1].transactionDate || "") < (a[1].transactionDate || "") ? -1 : 1; })
    .slice(0, 20)
    .map(function(entry) {
      var row = entry[1];
      return {
        date: row.transactionDate || null,
        name: row.ownerName || null,
        code: row.transactionCode || null,
        price: sf(row.transactionPrice),
        acquired: row.transactionAcquiredDisposed || null,
      };
    });

  var HO = raw.Holders || {};
  var instHolders = Object.values(HO.Institutions || {})
    .filter(function(h) { return h && h.name; })
    .slice(0, 10)
    .map(function(h) {
      return { name: h.name, shares: h.currentShares || null, pct: sf(h.totalShares), change: sf(h.change_p) };
    });
  var fundHolders = Object.values(HO.Funds || {})
    .filter(function(h) { return h && h.name; })
    .slice(0, 10)
    .map(function(h) {
      return { name: h.name, shares: h.currentShares || null, pct: sf(h.totalShares), change: sf(h.change_p) };
    });

  return {
    name:    G.Name   || null,
    sector:  G.Sector || null,
    isETF:   isETF,
    divYield:         round(divYield, 3),
    annualDiv:        round(annualDiv, 4),
    payout:           round(payout, 1),
    marketCap:        H.MarketCapitalization ? Math.round(parseFloat(H.MarketCapitalization) / 1e9) : null,
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
    valuation:        valuation,
    analyst:          analyst,
    technicals:       technicals,
    estimates:        estimates,
    insiders:         insiders,
    holders:          { institutions: instHolders, funds: fundHolders },
    exDivDate:        SD.ExDividendDate || null,
    divPayDate:       SD.DividendDate || null,
    bookValue:        sf(H.BookValue),
    grossProfit:      sf(H.GrossProfitTTM),
    revenuePerShare:  sf(H.RevenuePerShareTTM),
    history: {
      revenue:           quarterly(incQ, "totalRevenue"),
      eps:               quarterly(incQ, "dilutedEPS"),
      netIncome:         quarterly(incQ, "netIncome"),
      fcf:               fcfHistory,
      netDebt:           netDebtHistory,
      shares:            quarterly(balQ, "commonStockSharesOutstanding", 1 / 1e6),
      ebit:              ebitHistory.map(function(d) { return { date: d.date, value: d.value }; }),
      earningsSurprises: earningsSurprises,
    },
    annualHistory: annHist,
    g5:     annHist.dps ? computeG5(annHist.dps) : null,
    streak: annHist.dps ? computeStreak(annHist.dps) : null,
  };
}
