import React, { useState } from 'react';
import { buildDividendSeries } from '../../utils/dividendSeries';
import SingleSeriesBar from './SingleSeriesBar';

/**
 * Dividend per share / yield history and forecast chart.
 * Toggle between "History", "Future", or "Both" views.
 */
export default function DividendHistoryForecast({
  currentDiv, g5rate, label = "Dividend Per Share", color = "#005EB8",
  sharedHov = null, onHov = null, isYield = false,
}) {
  const [lookback, setLookback] = useState(10);
  const [view, setView] = useState("history");

  const series = buildDividendSeries(currentDiv || 0, g5rate || 0, lookback, lookback);

  let filtered = series;
  if (view === "history") filtered = series.filter(s => s.kind !== "future");
  else if (view === "future") filtered = series.filter(s => s.kind !== "history");

  const pts = filtered.map(s => ({
    yr: s.yr,
    label: String(s.yr),
    value: s.div,
    kind: s.kind,
  }));

  const fmtVal = isYield
    ? (v) => `${v.toFixed(2)}%`
    : (v) => `$${v.toFixed(4)}`;

  const views = ["history", "future", "both"];

  return (
    <div style={{
      background: "#071525", border: "1px solid #0a1e30", padding: "1.2rem",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: "0.8rem",
      }}>
        <div style={{
          fontSize: "0.6rem", color: "#1a4060", letterSpacing: "0.2em",
          textTransform: "uppercase",
        }}>
          {label} — History & Forecast
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {views.map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: "3px 10px", fontSize: "0.65rem",
              background: view === v ? "#005EB8" : "transparent",
              color: view === v ? "#c8dff0" : "#2a4a6a",
              border: `1px solid ${view === v ? "#005EB8" : "#0a1e30"}`,
              cursor: "pointer", textTransform: "capitalize",
            }}>
              {v}
            </button>
          ))}
        </div>
      </div>
      <SingleSeriesBar
        pts={pts}
        valKey="value"
        color={color}
        fmt={fmtVal}
        labelKey="label"
        sharedHov={sharedHov}
        onHov={onHov}
        H={160}
        PL={50}
        PB={30}
      />
    </div>
  );
}
