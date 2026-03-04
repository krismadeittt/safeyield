// Tickers that pay monthly dividends
export const MONTHLY_PAYERS = new Set([
  "O", "MAIN", "STAG", "AGNC", "JEPI", "JEPQ", "RYLD", "QYLD", "XYLD", "DIVO",
  "PFF", "PGX", "PFFD", "SRET", "GOOD", "GAIN", "LAND", "PSEC", "EARN", "HRZN",
  "FSK", "ARCC", "HTGC", "NEWT", "SLRC", "TCPC", "GLAD", "PNNT", "SAR", "TPVG",
  "TRIN", "CSWC", "BIZD", "EMLP", "UTF", "UTG", "SCHD", "VYM", "HDV", "DVY",
  "SDY", "SPYD", "VIG", "VIGI", "VYMI", "PEY", "DGRW", "DGRO", "AGG", "BND",
  "LQD", "HYG", "JNK", "VNQ", "SCHH", "REM", "XLE", "XLU", "XLF", "XLRE",
  "SPY", "VOO", "QQQ", "IVV", "VTI", "SCHB", "VEA", "VWO", "EFA", "BST", "NUSI",
]);

// ETFs that are in MONTHLY_PAYERS but pay quarterly (index-style ETFs)
export const QUARTERLY_ETFS = new Set([
  "SCHD", "VYM", "HDV", "DVY", "SDY", "SPYD", "VIG", "VIGI", "VYMI", "PEY",
  "DGRW", "DGRO", "AGG", "BND", "LQD", "HYG", "JNK", "VNQ", "SCHH", "REM",
  "XLE", "XLU", "XLF", "XLRE", "SPY", "VOO", "QQQ", "IVV", "VTI", "SCHB",
  "VEA", "VWO", "EFA", "BST", "NUSI",
]);

// Dividend payment schedule groups (which months they pay)
// Group A: Jan, Apr, Jul, Oct
export const GROUP_A = new Set([
  "ABT", "MDT", "BDX", "PEP", "GIS", "HRL", "SYY", "KMB", "WMT",
  "MO", "GPC", "AFL", "CB", "CINF", "MMC", "SPGI", "ADP", "CAH", "CAT",
  "HON", "ITW", "EMR", "GWW", "NUE", "ADM", "APD", "ECL", "SHW", "PPG",
  "WFC", "USB", "JPM", "GS", "MS", "BAC", "T", "VZ", "ATO", "NI", "SWK",
  "XOM", "CVX", "ETN", "MMM", "BEN", "KVUE", "XLE", "XLU", "XLF", "XLRE",
  "SPY", "VOO", "QQQ", "IVV", "VTI", "SCHB",
]);

// Group B: Feb, May, Aug, Nov
export const GROUP_B = new Set([
  "PG", "KO", "CL", "MCD", "TGT", "LOW", "YUM", "HSY", "K", "CPB",
  "MKC", "ABBV", "AMGN", "BMY", "PFE", "MRK", "UNH", "CI", "ELV", "DVA",
  "BAX", "COF", "AXP", "MA", "V", "TFC", "PNC", "MTB", "HBAN", "FITB",
  "RF", "KEY", "NEE", "DUK", "SO", "D", "AEE", "CMS", "DTE", "ETR",
  "AEP", "PPL", "FE", "SCHD", "VYM", "HDV", "DVY", "SDY", "SPYD", "VIG",
  "VIGI", "VYMI", "PEY", "DGRW", "DGRO", "VEA", "VWO", "EFA", "BST",
  "NUSI", "EPD", "ET",
]);

// Group C: Mar, Jun, Sep, Dec
export const GROUP_C = new Set([
  "JNJ", "WPC", "COLD", "AAPL", "MSFT", "GOOGL", "META", "AMZN", "AGG",
  "BND", "LQD", "HYG", "JNK", "VNQ", "SCHH", "REM", "D", "DUK", "XEL",
  "WEC", "ES", "LNT", "CMS", "VFC", "LEG", "CLX", "BF.B", "TR", "INGR",
  "JKHY", "PAYX", "ROL", "EXPD", "UNP", "CSX", "NSC", "GD", "LMT", "RTX",
  "NOC", "L", "PH", "ROK", "AME", "XYL", "FAST", "CINTAS",
]);
