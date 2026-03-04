import { useState, useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import { buildSunburstData } from "../utils/vizData";
import VizTooltip, { MetricBox } from "./VizTooltip";
import useIsMobile from "../hooks/useIsMobile";

const SECTOR_COLORS = {
  Technology: "#0891b2", Financials: "#7c3aed", Healthcare: "#059669",
  Consumer: "#d97706", Industrial: "#ea580c", Energy: "#dc2626",
  REITs: "#9333ea", Utilities: "#65a30d", "Broad Market": "#6d28d9",
  "Dividend ETF": "#2563eb", "Money Market": "#64748b", Other: "#475569",
};
const ASSET_COLORS = { Stocks: "#0c7792", ETFs: "#5b21b6", Cash: "#475569" };
const YIELD_TIER_COLORS = { Minimal: "#1e293b", "Low Yield": "#1d4ed8", "Mid Yield": "#ca8a04", "High Yield": "#15803d" };

function shortMoney(val) {
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `$${Math.round(val / 1e3)}k`;
  return `$${Math.round(val)}`;
}

export default function PortfolioSunburst({ holdings, liveData, portfolioValue, weightedYield, annualIncome }) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [isZoomed, setIsZoomed] = useState(false);
  const isMobile = useIsMobile();

  const W = isMobile ? 340 : 600;
  const H = W;

  const sunburstData = useMemo(
    () => buildSunburstData(holdings, liveData, portfolioValue),
    [holdings, liveData, portfolioValue]
  );

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

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const radius = Math.min(W, H) / 2;
    const zoomG = svg.append("g");
    const g = zoomG.append("g").attr("transform", `translate(${W / 2},${H / 2})`);

    // D3 zoom: drag to pan, double-click to reset
    const zoom = d3.zoom()
      .scaleExtent([1, 4])
      .on("zoom", (event) => {
        zoomG.attr("transform", event.transform);
        setIsZoomed(event.transform.k > 1.05);
      });
    svg.call(zoom);
    svg.on("wheel.zoom", null); // disable scroll zoom
    svg.on("dblclick.zoom", null); // override default dblclick zoom
    svg.on("dblclick", () => {
      svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity);
    });

    // Add yield tier children (Ring 4)
    const data = JSON.parse(JSON.stringify(sunburstData));
    (function addTier(n) {
      if (n.val && n.yieldTier) {
        n.children = [{ name: n.yieldTier, tierVal: n.val, ticker: n.name, yieldPct: n.yield }];
        return;
      }
      if (n.children) n.children.forEach(addTier);
    })(data);

    const root = d3.hierarchy(data).sum(d => d.tierVal || 0).sort((a, b) => b.value - a.value);
    d3.partition().size([2 * Math.PI, radius])(root);

    const innerR = radius * 0.15;
    const band = (radius - innerR) / 4;
    const rs = (d) => ({ i: innerR + (d.depth - 1) * band, o: innerR + d.depth * band - 1.5 });

    const arc = d3.arc()
      .startAngle(d => d.x0).endAngle(d => d.x1)
      .padAngle(0.003).padRadius(radius * 0.3)
      .innerRadius(d => rs(d).i).outerRadius(d => rs(d).o);

    const color = (d) => {
      if (d.depth === 1) return ASSET_COLORS[d.data.name] || "#475569";
      if (d.depth === 2) return d3.color(SECTOR_COLORS[d.data.name] || "#475569").darker(0.6).toString();
      if (d.depth === 3) {
        const base = d3.color(SECTOR_COLORS[d.parent?.data?.name] || "#475569");
        const ch = d.data.daily || 0;
        if (ch > 1) return base.brighter(0.7).toString();
        if (ch > 0) return base.brighter(0.3).toString();
        if (ch < -0.5) return base.darker(0.5).toString();
        if (ch < 0) return base.darker(0.2).toString();
        return base.toString();
      }
      if (d.depth === 4) return YIELD_TIER_COLORS[d.data.name] || "#334155";
      return "#475569";
    };

    const nodes = root.descendants().filter(d => d.depth > 0);
    const totalValue = root.value || portfolioValue;

    const paths = g.selectAll("path.seg")
      .data(nodes).join("path").attr("class", "seg")
      .attr("d", arc).attr("fill", d => color(d))
      .attr("fill-opacity", d => d.depth === 4 ? 0.85 : 0.9)
      .attr("stroke", "#0a0f1a").attr("stroke-width", d => d.depth <= 2 ? 1.8 : 1)
      .style("cursor", "pointer");

    paths.on("click", function (ev, d) {
      ev.stopPropagation();
      const [cx, cy] = arc.centroid(d);
      const px = cx + W / 2, py = cy + H / 2;
      const k = 2.5;
      const transform = d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-px, -py);
      svg.transition().duration(400).call(zoom.transform, transform);
    });

    paths.on("mouseenter", function (ev, d) {
      paths.attr("fill-opacity", node => {
        if (node === d) return 1;
        let c = d; while (c) { if (c === node) return 0.85; c = c.parent; }
        c = node; while (c) { if (c === d) return 0.85; c = c.parent; }
        return 0.15;
      }).attr("stroke-width", node => node === d ? 2.5 : (node.depth <= 2 ? 1.8 : 1))
        .attr("stroke", node => node === d ? "#f8fafc" : "#0a0f1a");
      setHovered(d);
    }).on("mouseleave", function () {
      paths.attr("fill-opacity", d => d.depth === 4 ? 0.85 : 0.9)
        .attr("stroke-width", d => d.depth <= 2 ? 1.8 : 1)
        .attr("stroke", "#0a0f1a");
      setHovered(null);
    });

    const lbl = (d, minArc) => (d.x1 - d.x0) > minArc;
    const fontFamily = "'EB Garamond', Georgia, serif";

    // Ring 1: Asset Class
    nodes.filter(d => d.depth === 1 && lbl(d, 0.08)).forEach(d => {
      const mid = (d.x0 + d.x1) / 2, r = (rs(d).i + rs(d).o) / 2;
      const deg = mid * (180 / Math.PI) - 90, flip = deg > 90 && deg < 270;
      const pct = ((d.value / totalValue) * 100).toFixed(0);
      const tr = `rotate(${deg}) translate(${r},0) rotate(${flip ? 180 : 0})`;
      g.append("text").attr("transform", tr).attr("text-anchor", "middle").attr("dy", "-0.2em")
        .attr("fill", "#f1f5f9").attr("font-size", "11px").attr("font-weight", "700")
        .attr("font-family", fontFamily).attr("letter-spacing", "1.5px")
        .attr("pointer-events", "none").attr("paint-order", "stroke")
        .attr("stroke", "rgba(10,15,26,0.85)").attr("stroke-width", "3px")
        .text(d.data.name.toUpperCase());
      g.append("text").attr("transform", tr).attr("text-anchor", "middle").attr("dy", "1.1em")
        .attr("fill", "#94a3b8").attr("font-size", "9px").attr("font-weight", "500")
        .attr("font-family", fontFamily)
        .attr("pointer-events", "none").attr("paint-order", "stroke")
        .attr("stroke", "rgba(10,15,26,0.85)").attr("stroke-width", "3px")
        .text(`${pct}%`);
    });

    // Ring 2: Sector
    nodes.filter(d => d.depth === 2 && lbl(d, 0.06)).forEach(d => {
      const mid = (d.x0 + d.x1) / 2, r = (rs(d).i + rs(d).o) / 2;
      const deg = mid * (180 / Math.PI) - 90, flip = deg > 90 && deg < 270;
      g.append("text").attr("transform", `rotate(${deg}) translate(${r},0) rotate(${flip ? 180 : 0})`)
        .attr("text-anchor", "middle").attr("dy", "0.35em")
        .attr("fill", "#e2e8f0").attr("font-size", "9px").attr("font-weight", "600")
        .attr("font-family", fontFamily).attr("letter-spacing", "0.5px")
        .attr("pointer-events", "none").attr("paint-order", "stroke")
        .attr("stroke", "rgba(10,15,26,0.8)").attr("stroke-width", "2.5px")
        .text(d.data.name);
    });

    // Ring 3: Holdings
    nodes.filter(d => d.depth === 3 && lbl(d, 0.03)).forEach(d => {
      const mid = (d.x0 + d.x1) / 2, r = (rs(d).i + rs(d).o) / 2;
      const deg = mid * (180 / Math.PI) - 90, flip = deg > 90 && deg < 270;
      const tr = `rotate(${deg}) translate(${r},0) rotate(${flip ? 180 : 0})`;
      g.append("text").attr("transform", tr).attr("text-anchor", "middle").attr("dy", "-0.15em")
        .attr("fill", "#f8fafc").attr("font-size", "8.5px").attr("font-weight", "600")
        .attr("font-family", fontFamily)
        .attr("pointer-events", "none").attr("paint-order", "stroke")
        .attr("stroke", "rgba(10,15,26,0.75)").attr("stroke-width", "2.5px")
        .text(d.data.name);
      if (lbl(d, 0.06)) {
        const ch = d.data.daily || 0;
        g.append("text").attr("transform", tr).attr("text-anchor", "middle").attr("dy", "1em")
          .attr("fill", ch >= 0 ? "#4ade80" : "#f87171").attr("font-size", "7px").attr("font-weight", "500")
          .attr("font-family", fontFamily)
          .attr("pointer-events", "none").attr("paint-order", "stroke")
          .attr("stroke", "rgba(10,15,26,0.7)").attr("stroke-width", "2px")
          .text(`${ch >= 0 ? "+" : ""}${ch}%`);
      }
    });

    // Ring 4: Yield tier %
    nodes.filter(d => d.depth === 4 && lbl(d, 0.05)).forEach(d => {
      const mid = (d.x0 + d.x1) / 2, r = (rs(d).i + rs(d).o) / 2;
      const deg = mid * (180 / Math.PI) - 90, flip = deg > 90 && deg < 270;
      g.append("text").attr("transform", `rotate(${deg}) translate(${r},0) rotate(${flip ? 180 : 0})`)
        .attr("text-anchor", "middle").attr("dy", "0.35em")
        .attr("fill", "#cbd5e1").attr("font-size", "7.5px").attr("font-weight", "500")
        .attr("font-family", fontFamily)
        .attr("pointer-events", "none").attr("paint-order", "stroke")
        .attr("stroke", "rgba(10,15,26,0.7)").attr("stroke-width", "2px")
        .text(`${d.data.yieldPct}%`);
    });

    // Center hub
    g.append("circle").attr("r", innerR - 2).attr("fill", "#0a0f1a").attr("stroke", "rgba(56,189,248,0.1)").attr("stroke-width", 1);
    g.append("text").attr("text-anchor", "middle").attr("dy", "-1.3em").attr("fill", "#334155").attr("font-size", "7px").attr("font-family", fontFamily).attr("letter-spacing", "3px").text("PORTFOLIO");
    g.append("text").attr("text-anchor", "middle").attr("dy", "0.15em").attr("fill", "#f8fafc").attr("font-size", "16px").attr("font-weight", "700").attr("font-family", "'Playfair Display', Georgia, serif").text(shortMoney(portfolioValue));
    g.append("text").attr("text-anchor", "middle").attr("dy", "1.6em").attr("fill", "#22c55e").attr("font-size", "8px").attr("font-family", fontFamily).text(`${(weightedYield || 0).toFixed(2)}% yield`);
  }, [sunburstData, portfolioValue, W, H, weightedYield]);

  // Resolve Ring 4 hover to parent holding
  const resolveHolding = (d) => {
    if (!d) return null;
    if (d.depth === 4) return d.parent;
    return d;
  };
  const display = resolveHolding(hovered);
  const td = display?.data;
  const isHolding = display?.depth === 3;
  const isSector = display?.depth === 2;
  const isAsset = display?.depth === 1;
  const alloc = (n) => n ? ((n.value / (portfolioValue || 1)) * 100).toFixed(1) : "0";

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Main layout */}
      <div style={{
        display: "flex", padding: "8px 20px", gap: 20, alignItems: "flex-start",
        flexWrap: "wrap", justifyContent: "center",
      }}>
        {/* Sunburst */}
        <div style={{ flex: "0 0 auto", overflow: "hidden", position: "relative" }}>
          <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", maxWidth: "100%", cursor: isZoomed ? "grab" : "pointer" }} />
          {isZoomed && (
            <div style={{
              position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
              fontSize: 9, color: "#94a3b8", background: "rgba(10,15,26,0.85)",
              padding: "4px 10px", borderRadius: 4, pointerEvents: "none",
              fontFamily: "'EB Garamond', Georgia, serif", letterSpacing: 1,
            }}>
              DOUBLE-CLICK TO RESET VIEW
            </div>
          )}
        </div>

        {/* Legend */}
        {!isMobile && (
          <div style={{ flex: "1 1 210px", minWidth: 190, maxWidth: 260, paddingTop: 4 }}>
            <div style={{ background: "var(--bg-dark)", border: "1px solid var(--border-subtle)", padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 8, letterSpacing: 2, color: "var(--text-dim)", marginBottom: 10, fontFamily: "'EB Garamond', Georgia, serif" }}>4 RINGS — INSIDE → OUT</div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 8, color: "var(--text-sub)", marginBottom: 5 }}>1 — Asset Class</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {Object.entries(ASSET_COLORS).map(([n, c]) => (
                    <div key={n} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 10, height: 10, background: c, boxShadow: `0 0 5px ${c}44` }} />
                      <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{n}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 8, color: "var(--text-sub)", marginBottom: 5 }}>2 — Sector</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {Object.entries(SECTOR_COLORS).map(([n, c]) => (
                    <div key={n} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <div style={{ width: 8, height: 8, background: c, boxShadow: `0 0 4px ${c}44` }} />
                      <span style={{ fontSize: 8, color: "var(--text-dim)" }}>{n}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 8, color: "var(--text-sub)", marginBottom: 5 }}>3 — Holdings</div>
                <div style={{ fontSize: 8, color: "var(--text-dim)" }}>Sector hue ± daily performance tint</div>
                <div style={{ height: 8, background: "linear-gradient(90deg, #7f1d1d, #475569, #15803d)", marginTop: 4, border: "1px solid rgba(255,255,255,0.04)" }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 7, color: "var(--text-sub)", marginTop: 2 }}>
                  <span>Loss</span><span>Gain</span>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 8, color: "var(--text-sub)", marginBottom: 5 }}>4 — Yield Tier</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {Object.entries(YIELD_TIER_COLORS).map(([n, c]) => (
                    <div key={n} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <div style={{ width: 8, height: 8, background: c }} />
                      <span style={{ fontSize: 8, color: "var(--text-dim)" }}>{n}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tooltip */}
      {hovered && td && (
        <VizTooltip mouse={mouse} containerRef={containerRef} width={240} height={isHolding ? 340 : 120}>
          <div style={{ fontSize: 8, letterSpacing: 2, color: "var(--text-dim)" }}>
            {isHolding ? "HOLDING" : isSector ? "SECTOR" : isAsset ? "ASSET CLASS" : "YIELD TIER"}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", fontFamily: "'Playfair Display', Georgia, serif" }}>{td.name}</div>
          {isHolding && td.full && <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 8 }}>{td.full}</div>}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginTop: 6 }}>
            <MetricBox label="ALLOC" value={`${alloc(display)}%`} color="#38bdf8" />
            <MetricBox label="VALUE" value={`$${display.value.toLocaleString()}`} color="var(--text-primary)" />
            {isHolding && (
              <>
                <MetricBox label="DAILY" value={`${td.daily >= 0 ? "+" : ""}${td.daily}%`} color={td.daily >= 0 ? "var(--green)" : "var(--red)"} />
                <MetricBox label="YIELD" value={`${td.yield}%`} color="#f59e0b" />
                <MetricBox label="5Y GROWTH" value={td.growth5y ? `+${td.growth5y}%` : "\u2014"} color="var(--green)" />
                <MetricBox label="PAYOUT" value={td.payout ? `${td.payout}%` : "\u2014"} color={td.payout > 55 ? "#f97316" : "var(--text-muted)"} />
                <MetricBox label="PRICE" value={`$${td.price}`} color="var(--text-primary)" />
                <MetricBox label="STREAK" value={td.streak ? `${td.streak}y` : "\u2014"} color={td.streak >= 25 ? "#f59e0b" : "var(--text-dim)"} />
              </>
            )}
          </div>
        </VizTooltip>
      )}
    </div>
  );
}
