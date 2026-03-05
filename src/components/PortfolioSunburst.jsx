import { useState, useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import { buildSunburstData } from "../utils/vizData";
import VizTooltip, { MetricBox } from "./VizTooltip";
import useIsMobile from "../hooks/useIsMobile";
import { shortMoney } from "../utils/format";

const SECTOR_COLORS = {
  Technology: "#5B8DEF", Financials: "#8B7AE8", Healthcare: "#3CBFA3",
  Consumer: "#D4668E", Industrial: "#6AAF6E", Energy: "#E09145",
  REITs: "#9333ea", Utilities: "#65a30d", "Broad Market": "#6d28d9",
  "Dividend ETF": "#2563eb", "Money Market": "#929AB0", Other: "#6B7394",
};
const ASSET_COLORS = { Stocks: "#5B8DEF", ETFs: "#8B7AE8", Cash: "#929AB0" };
const YIELD_TIER_COLORS = { Minimal: "#C5CAD6", "Low Yield": "#8B7AE8", "Mid Yield": "#5B8DEF", "High Yield": "#E09145" };

export default function PortfolioSunburst({ holdings, liveData, portfolioValue, weightedYield, annualIncome, expanded, cashBalance = 0 }) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [isZoomed, setIsZoomed] = useState(false);
  const isMobile = useIsMobile();

  const baseW = isMobile ? 340 : (expanded ? 480 : 280);
  const W = baseW;
  const H = W;

  const sunburstData = useMemo(
    () => buildSunburstData(holdings, liveData, portfolioValue, cashBalance),
    [holdings, liveData, portfolioValue, cashBalance]
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
    svg.on("wheel.zoom", null);
    svg.on("dblclick.zoom", null);
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
      if (d.depth === 1) return ASSET_COLORS[d.data.name] || "#6B7394";
      if (d.depth === 2) return d3.color(SECTOR_COLORS[d.data.name] || "#6B7394").darker(0.2).toString();
      if (d.depth === 3) {
        const base = d3.color(SECTOR_COLORS[d.parent?.data?.name] || "#6B7394");
        const ch = d.data.daily || 0;
        if (ch > 1) return base.brighter(0.5).toString();
        if (ch > 0) return base.brighter(0.2).toString();
        if (ch < -0.5) return base.darker(0.4).toString();
        if (ch < 0) return base.darker(0.15).toString();
        return base.toString();
      }
      if (d.depth === 4) return YIELD_TIER_COLORS[d.data.name] || "#C5CAD6";
      return "#6B7394";
    };

    const nodes = root.descendants().filter(d => d.depth > 0);
    const totalValue = root.value || portfolioValue;

    const paths = g.selectAll("path.seg")
      .data(nodes).join("path").attr("class", "seg")
      .attr("d", arc).attr("fill", d => color(d))
      .attr("fill-opacity", d => d.depth === 4 ? 0.85 : 0.9)
      .attr("stroke", "var(--bg-card)").attr("stroke-width", d => d.depth <= 2 ? 1.8 : 1)
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
      const isRelated = (node) => {
        let c = d; while (c) { if (c === node) return true; c = c.parent; }
        c = node; while (c) { if (c === d) return true; c = c.parent; }
        return false;
      };
      paths.attr("fill-opacity", node => {
        if (node === d) return 1;
        return isRelated(node) ? 0.85 : 0.15;
      }).attr("stroke-width", node => node === d ? 2.5 : (node.depth <= 2 ? 1.8 : 1))
        .attr("stroke", node => node === d ? "var(--text-primary)" : "var(--bg-card)");
      if (expanded) {
        g.selectAll("text.arc-label").attr("fill-opacity", node => {
          if (node === d) return 1;
          return isRelated(node) ? 0.9 : 0.1;
        });
      }
      setHovered(d);
    }).on("mouseleave", function () {
      paths.attr("fill-opacity", d => d.depth === 4 ? 0.85 : 0.9)
        .attr("stroke-width", d => d.depth <= 2 ? 1.8 : 1)
        .attr("stroke", "var(--bg-card)");
      if (expanded) {
        g.selectAll("text.arc-label").attr("fill-opacity", 1);
      }
      setHovered(null);
    });

    // Arc labels — only in expanded mode
    if (expanded) {
      const labelNodes = nodes.filter(d => {
        const angle = d.x1 - d.x0;
        if (d.depth === 1) return angle > 0.15;
        if (d.depth === 2) return angle > 0.20;
        if (d.depth === 3) return angle > 0.08;
        if (d.depth === 4) return angle > 0.10;
        return false;
      });

      g.selectAll("text.arc-label")
        .data(labelNodes)
        .join("text")
        .attr("class", "arc-label")
        .attr("transform", d => {
          const [cx, cy] = arc.centroid(d);
          const angle = (Math.atan2(cy, cx) * 180) / Math.PI;
          const flip = angle > 90 || angle < -90;
          return `translate(${cx},${cy}) rotate(${flip ? angle + 180 : angle})`;
        })
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("fill", "#fff")
        .attr("font-size", d => {
          if (d.depth === 1) return 10;
          if (d.depth === 2) return 9;
          if (d.depth === 3) return 8;
          return 7;
        })
        .attr("font-family", "'DM Sans', system-ui, sans-serif")
        .attr("font-weight", d => d.depth <= 2 ? 600 : 500)
        .attr("pointer-events", "none")
        .text(d => {
          if (d.depth === 4) return `${d.data.yieldPct}%`;
          return d.data.name;
        });
    }

  }, [sunburstData, portfolioValue, W, H, weightedYield, expanded]);

  const display = hovered;
  const td = display?.data;
  const isHolding = display?.depth === 3;
  const isSector = display?.depth === 2;
  const isAsset = display?.depth === 1;
  const isYieldTier = display?.depth === 4;
  const alloc = (n) => n ? ((n.value / (portfolioValue || 1)) * 100).toFixed(1) : "0";
  const useTooltipDocked = !expanded && !isMobile;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Main layout */}
      <div style={{
        display: "flex", gap: 20, alignItems: "flex-start",
        flexWrap: "wrap", justifyContent: "center",
      }}>
        {/* Sunburst */}
        <div style={{ flex: "0 0 auto", overflow: "hidden", position: "relative" }}>
          <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", maxWidth: "100%", cursor: isZoomed ? "grab" : "pointer" }} />
          {isZoomed && (
            <div style={{
              position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
              fontSize: 9, color: "var(--text-muted)", background: "var(--bg-pill)",
              padding: "4px 10px", borderRadius: 6, pointerEvents: "none",
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}>
              Double-click to reset view
            </div>
          )}
        </div>

        {/* Legend — shown when expanded */}
        {expanded && !isMobile && (
          <div style={{ flex: "1 1 200px", minWidth: 190, maxWidth: 260, paddingTop: 4 }}>
            <div style={{ background: "var(--bg-pill)", border: "1px solid var(--border)", padding: 14, marginBottom: 12, borderRadius: 12 }}>
              <div style={{ fontSize: 8, letterSpacing: 2, color: "var(--text-dim)", marginBottom: 10, fontFamily: "'DM Sans', system-ui, sans-serif" }}>4 RINGS — INSIDE → OUT</div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 8, color: "var(--text-sub)", marginBottom: 5 }}>1 — Asset Class</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {Object.entries(ASSET_COLORS).map(([n, c]) => (
                    <div key={n} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 10, height: 10, background: c, borderRadius: 3 }} />
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
                      <div style={{ width: 8, height: 8, background: c, borderRadius: 2 }} />
                      <span style={{ fontSize: 8, color: "var(--text-dim)" }}>{n}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 8, color: "var(--text-sub)", marginBottom: 5 }}>3 — Holdings</div>
                <div style={{ fontSize: 8, color: "var(--text-dim)" }}>Sector hue ± daily performance tint</div>
                <div style={{ height: 8, background: "linear-gradient(90deg, #D4668E, #929AB0, #3CBFA3)", marginTop: 4, borderRadius: 4 }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 7, color: "var(--text-sub)", marginTop: 2 }}>
                  <span>Loss</span><span>Gain</span>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 8, color: "var(--text-sub)", marginBottom: 5 }}>4 — Yield Tier</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {Object.entries(YIELD_TIER_COLORS).map(([n, c]) => (
                    <div key={n} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <div style={{ width: 8, height: 8, background: c, borderRadius: 2 }} />
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
      {hovered && td && (() => {
        const tooltipH = isHolding ? 340 : isYieldTier ? 220 : 120;
        const parentData = isYieldTier ? hovered.parent?.data : null;
        return (
          <VizTooltip mouse={mouse} containerRef={containerRef} width={240} height={tooltipH} docked={useTooltipDocked}>
            <div style={{ fontSize: 8, letterSpacing: 2, color: "var(--text-dim)" }}>
              {isHolding ? "HOLDING" : isSector ? "SECTOR" : isAsset ? "ASSET CLASS" : "YIELD TIER"}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
              {isYieldTier ? td.name : td.name}
            </div>
            {isHolding && td.full && <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 8 }}>{td.full}</div>}
            {isYieldTier && td.ticker && <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 8 }}>{td.ticker}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginTop: 6 }}>
              {!isYieldTier && (
                <>
                  <MetricBox label="ALLOC" value={`${alloc(display)}%`} color="var(--primary)" />
                  <MetricBox label="VALUE" value={`$${display.value.toLocaleString()}`} color="var(--text-primary)" />
                </>
              )}
              {isHolding && (
                <>
                  <MetricBox label="DAILY" value={`${td.daily >= 0 ? "+" : ""}${td.daily}%`} color={td.daily >= 0 ? "var(--green)" : "var(--red)"} />
                  <MetricBox label="YIELD" value={`${td.yield}%`} color="var(--warning)" />
                  <MetricBox label="5Y GROWTH" value={td.growth5y ? `+${td.growth5y}%` : "\u2014"} color="var(--green)" />
                  <MetricBox label="PAYOUT" value={td.payout ? `${td.payout}%` : "\u2014"} color={td.payout > 55 ? "var(--warning)" : "var(--text-muted)"} />
                  <MetricBox label="PRICE" value={`$${td.price}`} color="var(--text-primary)" />
                  <MetricBox label="STREAK" value={td.streak ? `${td.streak}y` : "\u2014"} color={td.streak >= 25 ? "var(--warning)" : "var(--text-dim)"} />
                </>
              )}
              {isYieldTier && parentData && (
                <>
                  <MetricBox label="YIELD" value={`${td.yieldPct}%`} color="var(--warning)" />
                  <MetricBox label="DIV/SHARE" value={parentData.div ? `$${parentData.div}` : "\u2014"} color="var(--text-primary)" />
                  <MetricBox label="PAYOUT" value={parentData.payout ? `${parentData.payout}%` : "\u2014"} color={parentData.payout > 55 ? "var(--warning)" : "var(--text-muted)"} />
                  <MetricBox label="5Y GROWTH" value={parentData.growth5y ? `+${parentData.growth5y}%` : "\u2014"} color="var(--green)" />
                  <MetricBox label="STREAK" value={parentData.streak ? `${parentData.streak}y` : "\u2014"} color={parentData.streak >= 25 ? "var(--warning)" : "var(--text-dim)"} />
                </>
              )}
            </div>
          </VizTooltip>
        );
      })()}
    </div>
  );
}
