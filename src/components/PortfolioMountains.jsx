import { useState, useEffect, useRef, useMemo } from "react";
import { buildMountainData } from "../utils/vizData";
import VizTooltip, { MetricBox } from "./VizTooltip";
import useIsMobile from "../hooks/useIsMobile";
import { formatCurrency } from "../utils/format";

const SECTOR_COLORS = {
  Technology:    { base: "#0891b2", light: "#22d3ee", dark: "#064e5c", grad: ["#0e7490", "#06b6d4", "#67e8f9"] },
  Financials:    { base: "#7c3aed", light: "#a78bfa", dark: "#4c1d95", grad: ["#6d28d9", "#8b5cf6", "#c4b5fd"] },
  Healthcare:    { base: "#059669", light: "#34d399", dark: "#064e3b", grad: ["#047857", "#10b981", "#6ee7b7"] },
  Consumer:      { base: "#d97706", light: "#fbbf24", dark: "#78350f", grad: ["#b45309", "#f59e0b", "#fcd34d"] },
  Industrial:    { base: "#ea580c", light: "#fb923c", dark: "#7c2d12", grad: ["#c2410c", "#f97316", "#fdba74"] },
  Energy:        { base: "#dc2626", light: "#f87171", dark: "#7f1d1d", grad: ["#b91c1c", "#ef4444", "#fca5a5"] },
  REITs:         { base: "#9333ea", light: "#c084fc", dark: "#581c87", grad: ["#7e22ce", "#a855f7", "#d8b4fe"] },
  Utilities:     { base: "#65a30d", light: "#a3e635", dark: "#365314", grad: ["#4d7c0f", "#84cc16", "#bef264"] },
  "Broad Market":{ base: "#6d28d9", light: "#a78bfa", dark: "#3b0764", grad: ["#5b21b6", "#8b5cf6", "#c4b5fd"] },
  "Dividend ETF":{ base: "#2563eb", light: "#60a5fa", dark: "#1e3a5f", grad: ["#1d4ed8", "#3b82f6", "#93c5fd"] },
  "Money Market":{ base: "#64748b", light: "#94a3b8", dark: "#334155", grad: ["#475569", "#64748b", "#cbd5e1"] },
  Cash:          { base: "#64748b", light: "#94a3b8", dark: "#334155", grad: ["#475569", "#64748b", "#cbd5e1"] },
  Other:         { base: "#475569", light: "#94a3b8", dark: "#334155", grad: ["#334155", "#475569", "#94a3b8"] },
};

export default function PortfolioMountains({ holdings, liveData, portfolioValue, weightedYield, annualIncome }) {
  const containerRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const isMobile = useIsMobile();

  const W = 1100, H = 520;
  const baseY = H - 70;
  const peakMinY = 60;
  const mtnBaseHalf = 28;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e) => {
      const rect = el.getBoundingClientRect();
      setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    el.addEventListener("mousemove", handler);
    return () => el.removeEventListener("mousemove", handler);
  }, []);

  const rawData = useMemo(
    () => buildMountainData(holdings, liveData, portfolioValue),
    [holdings, liveData, portfolioValue]
  );

  // Build sector order dynamically from data
  const SECTOR_ORDER = useMemo(() => {
    const seen = new Set();
    const order = [];
    rawData.forEach(h => {
      if (!seen.has(h.sector)) { seen.add(h.sector); order.push(h.sector); }
    });
    return order;
  }, [rawData]);

  // Sort within sectors by price descending, arrange tallest in center
  const mountains = useMemo(() => {
    const grouped = [];
    SECTOR_ORDER.forEach(s => {
      const sectorHoldings = rawData.filter(h => h.sector === s);
      const sorted = [...sectorHoldings].sort((a, b) => b.price - a.price);
      const arranged = [];
      sorted.forEach((h, i) => {
        if (i % 2 === 0) arranged.push(h);
        else arranged.unshift(h);
      });
      arranged.forEach(h => grouped.push(h));
    });

    const n = grouped.length;
    if (n === 0) return [];
    const sectorGap = 18;
    const holdingGap = 4;
    const sectorCount = SECTOR_ORDER.filter(s => grouped.some(h => h.sector === s)).length;
    const totalGaps = sectorGap * (sectorCount - 1) + holdingGap * (n - sectorCount);
    const available = W - 80 - totalGaps;
    const peakWidth = available / n;
    const maxPrice = Math.max(...grouped.map(h => h.price), 1);

    let x = 40;
    let prevSector = null;

    return grouped.map((h, i) => {
      if (prevSector && h.sector !== prevSector) x += sectorGap;
      else if (i > 0) x += holdingGap;

      const cx = x + peakWidth / 2;
      const heightRatio = 0.25 + (h.price / maxPrice) * 0.75;
      const peakY = baseY - (baseY - peakMinY) * heightRatio;
      const halfW = mtnBaseHalf + peakWidth * 0.35;

      const result = { ...h, cx, peakY, halfW, leftX: cx - halfW, rightX: cx + halfW };
      x += peakWidth;
      prevSector = h.sector;
      return result;
    });
  }, [rawData, SECTOR_ORDER]);

  const sectorLabels = useMemo(() => {
    return SECTOR_ORDER.map(s => {
      const sectorMtns = mountains.filter(m => m.sector === s);
      if (!sectorMtns.length) return null;
      const minX = Math.min(...sectorMtns.map(m => m.leftX));
      const maxX = Math.max(...sectorMtns.map(m => m.rightX));
      return { sector: s, cx: (minX + maxX) / 2, minX, maxX };
    }).filter(Boolean);
  }, [mountains, SECTOR_ORDER]);

  const bgMountains = useMemo(() => {
    const peaks = [];
    for (let i = 0; i < 12; i++) {
      const cx = 30 + (W - 60) * (i / 11) + (Math.sin(i * 3.7) * 30);
      const peakY = baseY - 80 - ((i * 37) % 150);
      const hw = 60 + ((i * 53) % 80);
      peaks.push({ cx, peakY, leftX: cx - hw, rightX: cx + hw });
    }
    return peaks;
  }, []);

  const mtnPath = (m) => {
    const { cx, peakY, leftX, rightX } = m;
    const cpOffset = 6;
    return `M ${leftX} ${baseY} L ${cx - cpOffset} ${peakY + 3} Q ${cx} ${peakY - 2} ${cx + cpOffset} ${peakY + 3} L ${rightX} ${baseY} Z`;
  };

  const isHov = (m) => hovered?.ticker === m.ticker;
  const isSectorHov = (m) => hovered?.sector === m.sector;

  const maxPrice = mountains.length > 0 ? Math.max(...mountains.map(h => h.price), 1) : 1;

  return (
    <div ref={containerRef} style={{ position: "relative", overflow: "hidden" }}>
      {/* Title area */}
      <div style={{ padding: "10px 20px 0" }}>
        <div style={{ fontSize: 10, letterSpacing: 3, color: "var(--text-dim)", marginBottom: 4, fontFamily: "'EB Garamond', Georgia, serif" }}>PORTFOLIO LANDSCAPE</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", fontFamily: "'Playfair Display', Georgia, serif" }}>{formatCurrency(portfolioValue)}</span>
          <span style={{ fontSize: 12, color: "var(--green)" }}>{(weightedYield || 0).toFixed(2)}% yield</span>
          <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{holdings.length} holdings</span>
        </div>
        <div style={{ fontSize: 9, color: "var(--text-sub)", marginTop: 4 }}>Peak height = share price · Sector clusters form ranges · Hover for details</div>
      </div>

      {/* SVG Mountain Range */}
      <div style={{ padding: "8px 16px", overflow: "hidden" }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", maxWidth: "100%" }}>
          <defs>
            {SECTOR_ORDER.map(s => {
              const c = SECTOR_COLORS[s];
              if (!c) return null;
              return (
                <linearGradient key={`g-${s}`} id={`grad-${s.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.grad[2]} stopOpacity="0.95" />
                  <stop offset="35%" stopColor={c.grad[1]} stopOpacity="0.85" />
                  <stop offset="100%" stopColor={c.grad[0]} stopOpacity="0.7" />
                </linearGradient>
              );
            })}
            <linearGradient id="fog" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0f172a" stopOpacity="0" />
              <stop offset="70%" stopColor="#0f172a" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.9" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Stars */}
          {Array.from({ length: 30 }, (_, i) => (
            <circle key={`star-${i}`} cx={(i * 37.7) % W} cy={((i * 23.3) % (baseY * 0.4))} r={0.5 + (i % 3) * 0.4} fill="#f8fafc" opacity={0.05 + (i % 5) * 0.05} />
          ))}

          {/* Background distant mountains */}
          {bgMountains.map((m, i) => (
            <path key={`bg-${i}`}
              d={`M ${m.leftX} ${baseY} L ${m.cx} ${m.peakY} L ${m.rightX} ${baseY} Z`}
              fill="#0f1d32" stroke="none" opacity={0.4 + (i % 3) * 0.1}
            />
          ))}

          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((f, i) => {
            const y = baseY - (baseY - peakMinY) * f;
            return <line key={`grid-${i}`} x1={30} y1={y} x2={W - 30} y2={y} stroke="rgba(56,189,248,0.04)" strokeWidth="1" strokeDasharray="4,12" />;
          })}

          {/* Main mountains */}
          {[...mountains].sort((a, b) => a.peakY - b.peakY).map((m) => {
            const active = isHov(m);
            const sectorActive = isSectorHov(m);
            const faded = hovered && !sectorActive;
            const gradId = `grad-${m.sector.replace(/\s/g, "")}`;

            return (
              <g key={m.ticker}
                onMouseEnter={() => setHovered(m)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "pointer" }}
              >
                <ellipse cx={m.cx} cy={baseY + 2} rx={m.halfW * 0.7} ry={4}
                  fill={SECTOR_COLORS[m.sector]?.dark || "#1e293b"} opacity={active ? 0.5 : 0.15} />

                <path d={mtnPath(m)}
                  fill={`url(#${gradId})`}
                  opacity={faded ? 0.15 : active ? 1 : 0.8}
                  stroke={active ? "#f8fafc" : faded ? "none" : SECTOR_COLORS[m.sector]?.dark || "#1e293b"}
                  strokeWidth={active ? 2 : 0.5}
                  style={{ transition: "opacity 0.2s" }}
                />

                {!faded && (
                  <path
                    d={`M ${m.cx - 5} ${m.peakY + 10} L ${m.cx} ${m.peakY - 2} L ${m.cx + 5} ${m.peakY + 10} Z`}
                    fill={active ? "#f8fafc" : SECTOR_COLORS[m.sector]?.light || "#94a3b8"}
                    opacity={active ? 0.9 : 0.35}
                  />
                )}

                {!faded && (
                  <circle cx={m.cx} cy={m.peakY - 10} r={active ? 4 : 2.5}
                    fill={m.daily > 0 ? "#22c55e" : m.daily < 0 ? "#ef4444" : "#475569"}
                    opacity={active ? 1 : 0.6}
                    filter={active ? "url(#glow)" : "none"}
                    style={{ transition: "r 0.15s" }}
                  />
                )}

                {!faded && (
                  <text x={m.cx} y={m.peakY - 18}
                    textAnchor="middle" fill={active ? "#f8fafc" : "#cbd5e1"}
                    fontSize={active ? "10px" : "8px"} fontWeight={active ? "700" : "500"}
                    fontFamily="'EB Garamond', Georgia, serif"
                    paintOrder="stroke" stroke="rgba(10,15,26,0.85)" strokeWidth="2.5px"
                    opacity={active ? 1 : 0.75}
                    style={{ transition: "font-size 0.15s" }}
                  >
                    {m.ticker}
                  </text>
                )}

                {active && (
                  <text x={m.cx} y={m.peakY - 30}
                    textAnchor="middle" fill="#94a3b8"
                    fontSize="8px" fontWeight="500"
                    fontFamily="'EB Garamond', Georgia, serif"
                    paintOrder="stroke" stroke="rgba(10,15,26,0.85)" strokeWidth="2px"
                  >
                    ${m.price}
                  </text>
                )}
              </g>
            );
          })}

          {/* Fog overlay */}
          <rect x={0} y={baseY - 50} width={W} height={70 + 50} fill="url(#fog)" pointerEvents="none" />

          {/* Base line */}
          <line x1={20} y1={baseY} x2={W - 20} y2={baseY} stroke="rgba(56,189,248,0.12)" strokeWidth="1" />

          {/* Sector labels */}
          {sectorLabels.map(sl => {
            const c = SECTOR_COLORS[sl.sector];
            const active = hovered?.sector === sl.sector;
            return (
              <g key={sl.sector}>
                <line x1={sl.minX} y1={baseY + 8} x2={sl.maxX} y2={baseY + 8}
                  stroke={c?.base || "#475569"} strokeWidth={active ? 3 : 1.5} strokeLinecap="round"
                  opacity={hovered && !active ? 0.15 : 0.6}
                  style={{ transition: "opacity 0.2s" }}
                />
                <text x={sl.cx} y={baseY + 24}
                  textAnchor="middle" fill={active ? c?.light || "#f8fafc" : c?.base || "#64748b"}
                  fontSize="8px" fontWeight="600" letterSpacing="1px"
                  fontFamily="'EB Garamond', Georgia, serif"
                  opacity={hovered && !active ? 0.15 : 0.8}
                  style={{ transition: "opacity 0.2s" }}
                >
                  {sl.sector.toUpperCase()}
                </text>
              </g>
            );
          })}

          {/* Y-axis price reference */}
          {[200, 400, 600, 800].map(p => {
            const ratio = 0.25 + (p / maxPrice) * 0.75;
            const y = baseY - (baseY - peakMinY) * ratio;
            if (y < peakMinY - 10 || y > baseY - 20) return null;
            return (
              <text key={p} x={18} y={y + 3} fill="#1e293b" fontSize="7px"
                fontFamily="'EB Garamond', Georgia, serif" textAnchor="end">
                ${p}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Sector legend bar */}
      <div style={{ display: "flex", justifyContent: "center", gap: 12, padding: "4px 24px 8px", flexWrap: "wrap" }}>
        {SECTOR_ORDER.map(s => {
          const c = SECTOR_COLORS[s];
          const count = rawData.filter(h => h.sector === s).length;
          const active = hovered?.sector === s;
          return (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 4, opacity: hovered && !active ? 0.25 : 1, transition: "opacity 0.2s" }}>
              <div style={{ width: 8, height: 8, background: c?.base || "#475569", boxShadow: active ? `0 0 8px ${c?.base}88` : "none" }} />
              <span style={{ fontSize: 8, color: active ? "var(--text-primary)" : "var(--text-dim)" }}>{s}</span>
              <span style={{ fontSize: 7, color: "var(--text-sub)" }}>{count}</span>
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {hovered && (
        <VizTooltip mouse={mouse} containerRef={containerRef} width={240} height={340}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
            <span style={{ fontSize: 8, letterSpacing: 2, color: SECTOR_COLORS[hovered.sector]?.light || "var(--text-dim)" }}>
              {hovered.sector.toUpperCase()}
            </span>
            {hovered.streak >= 25 && (
              <span style={{ fontSize: 7, background: "rgba(251,191,36,0.12)", color: "#fbbf24", padding: "1px 6px", border: "1px solid rgba(251,191,36,0.2)" }}>
                {hovered.streak}y
              </span>
            )}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", fontFamily: "'Playfair Display', Georgia, serif" }}>{hovered.ticker}</div>
          <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 8 }}>{hovered.full}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
            <MetricBox label="WEIGHT" value={`${hovered.weight.toFixed(1)}%`} color="#38bdf8" />
            <MetricBox label="VALUE" value={`$${hovered.value.toLocaleString()}`} color="var(--text-primary)" />
            <MetricBox label="DAILY" value={`${hovered.daily >= 0 ? "+" : ""}${hovered.daily}%`} color={hovered.daily >= 0 ? "var(--green)" : "var(--red)"} />
            <MetricBox label="YIELD" value={`${hovered.yield}%`} color="#f59e0b" />
            <MetricBox label="5Y GROWTH" value={hovered.growth5y ? `+${hovered.growth5y}%` : "\u2014"} color="var(--green)" />
            <MetricBox label="PAYOUT" value={hovered.payout ? `${hovered.payout}%` : "\u2014"} color={hovered.payout > 55 ? "#f97316" : "var(--text-muted)"} />
            <MetricBox label="PRICE" value={`$${hovered.price}`} color="var(--text-primary)" />
            <MetricBox label="STREAK" value={hovered.streak ? `${hovered.streak}y` : "\u2014"} color={hovered.streak >= 25 ? "#f59e0b" : "var(--text-dim)"} />
          </div>
        </VizTooltip>
      )}
    </div>
  );
}
