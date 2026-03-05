import { useState, useEffect, useRef, useMemo } from "react";
import { buildMountainData } from "../utils/vizData";
import VizTooltip, { MetricBox } from "./VizTooltip";
import useIsMobile from "../hooks/useIsMobile";
import { formatCurrency, formatYield } from "../utils/format";

const SECTOR_COLORS = {
  Technology:    { base: "#5B8DEF", light: "#89B0F5", dark: "#3A6AD4", grad: ["#4A7DE0", "#5B8DEF", "#89B0F5"] },
  Financials:    { base: "#8B7AE8", light: "#A99AF0", dark: "#6B5AD0", grad: ["#7A6ADB", "#8B7AE8", "#A99AF0"] },
  Healthcare:    { base: "#3CBFA3", light: "#5DD4B8", dark: "#2A9A80", grad: ["#2FA890", "#3CBFA3", "#5DD4B8"] },
  Consumer:      { base: "#D4668E", light: "#E088A8", dark: "#B84A72", grad: ["#C55580", "#D4668E", "#E088A8"] },
  Industrial:    { base: "#6AAF6E", light: "#8BC48E", dark: "#4E9352", grad: ["#5AA15E", "#6AAF6E", "#8BC48E"] },
  Energy:        { base: "#E09145", light: "#EAA96A", dark: "#C87830", grad: ["#D48538", "#E09145", "#EAA96A"] },
  REITs:         { base: "#9333ea", light: "#c084fc", dark: "#7520C8", grad: ["#8228D8", "#9333ea", "#c084fc"] },
  Utilities:     { base: "#65a30d", light: "#a3e635", dark: "#4D7C0A", grad: ["#578F0C", "#65a30d", "#a3e635"] },
  "Broad Market":{ base: "#6d28d9", light: "#a78bfa", dark: "#5520B0", grad: ["#6024C8", "#6d28d9", "#a78bfa"] },
  "Dividend ETF":{ base: "#5B8DEF", light: "#89B0F5", dark: "#3A6AD4", grad: ["#4A7DE0", "#5B8DEF", "#89B0F5"] },
  "Money Market":{ base: "#929AB0", light: "#B8BFCE", dark: "#6B7394", grad: ["#7E869C", "#929AB0", "#B8BFCE"] },
  Cash:          { base: "#929AB0", light: "#B8BFCE", dark: "#6B7394", grad: ["#7E869C", "#929AB0", "#B8BFCE"] },
  Other:         { base: "#6B7394", light: "#929AB0", dark: "#4A5069", grad: ["#5A6280", "#6B7394", "#929AB0"] },
};

export default function PortfolioMountains({ holdings, liveData, portfolioValue, weightedYield, annualIncome, cashBalance = 0 }) {
  const containerRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const isMobile = useIsMobile();

  const W = 1100, H = 280;
  const baseY = H - 50;
  const peakMinY = 30;
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
    () => buildMountainData(holdings, liveData, portfolioValue, cashBalance),
    [holdings, liveData, portfolioValue, cashBalance]
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
      <div style={{ padding: "4px 20px 0" }}>
        <div style={{ fontSize: 10, letterSpacing: 3, color: "var(--text-dim)", marginBottom: 4, fontFamily: "'DM Sans', system-ui, sans-serif" }}>PORTFOLIO LANDSCAPE</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>{formatCurrency(portfolioValue)}</span>
          <span style={{ fontSize: 12, color: "var(--green)" }}>{formatYield(weightedYield || 0)} yield</span>
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
              <stop offset="0%" stopColor="var(--bg-card)" stopOpacity="0" />
              <stop offset="70%" stopColor="var(--bg-card)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--bg-card)" stopOpacity="0.9" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Subtle dots (stars in dark mode, faint dots in light) */}
          {Array.from({ length: 30 }, (_, i) => (
            <circle key={`star-${i}`} cx={(i * 37.7) % W} cy={((i * 23.3) % (baseY * 0.4))} r={0.5 + (i % 3) * 0.4} fill="var(--text-sub)" opacity={0.08 + (i % 5) * 0.04} />
          ))}

          {/* Background distant mountains */}
          {bgMountains.map((m, i) => (
            <path key={`bg-${i}`}
              d={`M ${m.leftX} ${baseY} L ${m.cx} ${m.peakY} L ${m.rightX} ${baseY} Z`}
              fill="var(--bg-dark)" stroke="none" opacity={0.4 + (i % 3) * 0.1}
            />
          ))}

          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((f, i) => {
            const y = baseY - (baseY - peakMinY) * f;
            return <line key={`grid-${i}`} x1={30} y1={y} x2={W - 30} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="4,12" />;
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
                  fill={SECTOR_COLORS[m.sector]?.dark || "var(--text-sub)"} opacity={active ? 0.5 : 0.15} />

                <path d={mtnPath(m)}
                  fill={`url(#${gradId})`}
                  opacity={faded ? 0.15 : active ? 1 : 0.8}
                  stroke={active ? "var(--text-primary)" : faded ? "none" : SECTOR_COLORS[m.sector]?.dark || "var(--text-sub)"}
                  strokeWidth={active ? 2 : 0.5}
                  style={{ transition: "opacity 0.2s" }}
                />

                {!faded && (
                  <path
                    d={`M ${m.cx - 5} ${m.peakY + 10} L ${m.cx} ${m.peakY - 2} L ${m.cx + 5} ${m.peakY + 10} Z`}
                    fill={active ? "var(--text-primary)" : SECTOR_COLORS[m.sector]?.light || "var(--text-dim)"}
                    opacity={active ? 0.9 : 0.35}
                  />
                )}

                {!faded && (
                  <circle cx={m.cx} cy={m.peakY - 10} r={active ? 4 : 2.5}
                    fill={m.daily > 0 ? "var(--green)" : m.daily < 0 ? "var(--red)" : "var(--text-dim)"}
                    opacity={active ? 1 : 0.6}
                    filter={active ? "url(#glow)" : "none"}
                    style={{ transition: "r 0.15s" }}
                  />
                )}

                {!faded && (
                  <text x={m.cx} y={m.peakY - 18}
                    textAnchor="middle" fill={active ? "var(--text-primary)" : "var(--text-muted)"}
                    fontSize={active ? "10px" : "8px"} fontWeight={active ? "700" : "500"}
                    fontFamily="'DM Sans', system-ui, sans-serif"
                    paintOrder="stroke" stroke="rgba(0,0,0,0.15)" strokeWidth="2.5px"
                    opacity={active ? 1 : 0.75}
                    style={{ transition: "font-size 0.15s" }}
                  >
                    {m.ticker}
                  </text>
                )}

                {active && (
                  <text x={m.cx} y={m.peakY - 30}
                    textAnchor="middle" fill="var(--text-dim)"
                    fontSize="8px" fontWeight="500"
                    fontFamily="'DM Sans', system-ui, sans-serif"
                    paintOrder="stroke" stroke="rgba(0,0,0,0.15)" strokeWidth="2px"
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
          <line x1={20} y1={baseY} x2={W - 20} y2={baseY} stroke="var(--border-accent)" strokeWidth="1" />

          {/* Sector labels */}
          {sectorLabels.map(sl => {
            const c = SECTOR_COLORS[sl.sector];
            const active = hovered?.sector === sl.sector;
            return (
              <g key={sl.sector}>
                <line x1={sl.minX} y1={baseY + 8} x2={sl.maxX} y2={baseY + 8}
                  stroke={c?.base || "var(--text-dim)"} strokeWidth={active ? 3 : 1.5} strokeLinecap="round"
                  opacity={hovered && !active ? 0.15 : 0.6}
                  style={{ transition: "opacity 0.2s" }}
                />
                <text x={sl.cx} y={baseY + 24}
                  textAnchor="middle" fill={active ? c?.light || "var(--text-primary)" : c?.base || "var(--text-dim)"}
                  fontSize="8px" fontWeight="600" letterSpacing="1px"
                  fontFamily="'DM Sans', system-ui, sans-serif"
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
              <text key={p} x={18} y={y + 3} fill="var(--text-sub)" fontSize="7px"
                fontFamily="'DM Sans', system-ui, sans-serif" textAnchor="end">
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
              <div style={{ width: 8, height: 8, background: c?.base || "var(--text-dim)", boxShadow: active ? `0 0 8px ${c?.base}88` : "none" }} />
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
              <span style={{ fontSize: 7, background: "rgba(251,191,36,0.12)", color: "var(--warning)", padding: "1px 6px", border: "1px solid rgba(251,191,36,0.2)" }}>
                {hovered.streak}y
              </span>
            )}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>{hovered.ticker}</div>
          <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 8 }}>{hovered.full}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
            <MetricBox label="WEIGHT" value={`${hovered.weight.toFixed(1)}%`} color="var(--primary)" />
            <MetricBox label="VALUE" value={`$${hovered.value.toLocaleString()}`} color="var(--text-primary)" />
            <MetricBox label="DAILY" value={`${hovered.daily >= 0 ? "+" : ""}${hovered.daily}%`} color={hovered.daily >= 0 ? "var(--green)" : "var(--red)"} />
            <MetricBox label="YIELD" value={`${hovered.yield}%`} color="var(--warning)" />
            <MetricBox label="5Y GROWTH" value={hovered.growth5y ? `+${hovered.growth5y}%` : "\u2014"} color="var(--green)" />
            <MetricBox label="PAYOUT" value={hovered.payout ? `${hovered.payout}%` : "\u2014"} color={hovered.payout > 55 ? "var(--warning)" : "var(--text-muted)"} />
            <MetricBox label="PRICE" value={`$${hovered.price}`} color="var(--text-primary)" />
            <MetricBox label="STREAK" value={hovered.streak ? `${hovered.streak}y` : "\u2014"} color={hovered.streak >= 25 ? "var(--warning)" : "var(--text-dim)"} />
          </div>
        </VizTooltip>
      )}
    </div>
  );
}
