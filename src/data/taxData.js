const TAX_QUALIFICATIONS = {
  O: "partial",
  NEE: "partial",
  STAG: "partial",
  VICI: "partial",
  AMT: "partial",
  WPC: "partial",
  ADC: "partial",
  DLR: "partial",
  NNN: "partial",
  MAA: "partial",
  GLPI: "partial",
  CCI: "partial",
  EPD: "partial",
  ENB: "partial",
  KMI: "partial",
  OKE: "partial",
  MAIN: "partial",
  INTC: "unqualified",
};

export function getTaxClass(ticker) {
  return TAX_QUALIFICATIONS[ticker] || "qualified";
}
