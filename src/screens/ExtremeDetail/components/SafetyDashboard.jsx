import React from 'react';
import useSafetyScores from '../../../hooks/extreme/useSafetyScores';
import { getGradeColor } from '../../../utils/safety';
import SafetyScoreCard from './SafetyScoreCard';
import SafetyAlertBanner from './SafetyAlertBanner';

export default function SafetyDashboard({ holdings, liveData, isMobile }) {
  var { scores, loading } = useSafetyScores(holdings, liveData);

  if (loading) {
    return <div style={{ padding: '2rem', color: 'var(--text-dim)', textAlign: 'center' }}>Calculating safety scores...</div>;
  }

  var tickers = Object.keys(scores);
  if (tickers.length === 0) {
    return (
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '3rem', textAlign: 'center',
        color: 'var(--text-dim)', fontSize: '0.85rem',
      }}>
        Add holdings to see dividend safety analysis.
      </div>
    );
  }

  // Sort by score ascending (worst first)
  var sorted = tickers.map(function(t) { return scores[t]; }).sort(function(a, b) { return a.score - b.score; });

  // Calculate portfolio average
  var totalScore = 0;
  for (var i = 0; i < sorted.length; i++) {
    totalScore += sorted[i].score;
  }
  var avgScore = Math.round((totalScore / sorted.length) * 100) / 100;

  // Determine average grade
  var avgGrade = avgScore >= 80 ? 'A' : avgScore >= 65 ? 'B' : avgScore >= 50 ? 'C' : avgScore >= 35 ? 'D' : 'F';
  var avgGradeColor = getGradeColor(avgGrade);

  // Distribution
  var distribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (var d = 0; d < sorted.length; d++) {
    distribution[sorted[d].grade] = (distribution[sorted[d].grade] || 0) + 1;
  }

  // Generate alerts for low-scoring holdings
  var alerts = [];
  for (var a = 0; a < sorted.length; a++) {
    var s = sorted[a];
    if (s.grade === 'F') {
      // Find the weakest factor
      var weakest = s.factors.length > 0 ? s.factors.reduce(function(min, f) { return f.score < min.score ? f : min; }, s.factors[0]) : null;
      alerts.push({
        ticker: s.ticker,
        message: weakest ? 'Weak ' + weakest.name + ' (score: ' + Math.round(weakest.score) + ')' : 'Very low safety score',
        severity: 'high',
      });
    } else if (s.grade === 'D') {
      alerts.push({
        ticker: s.ticker,
        message: 'Below-average safety (score: ' + Math.round(s.score) + ')',
        severity: 'medium',
      });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Dividend Safety</h2>
        <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
          Multi-factor safety analysis for each holding. Sorted by risk (worst first).
        </p>
      </div>

      {/* Alerts */}
      <SafetyAlertBanner alerts={alerts} />

      {/* Summary: Average Score + Distribution */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {/* Average Score Card */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 16, padding: '1.25rem', flex: '1 1 200px', minWidth: 180,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Portfolio Safety Score
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, color: avgGradeColor, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
            {Math.round(avgScore)}
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: avgGradeColor, marginTop: 4 }}>
            Grade: {avgGrade}
          </div>
        </div>

        {/* Distribution Bar Card */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 16, padding: '1.25rem', flex: '2 1 300px', minWidth: 250,
        }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Grade Distribution
          </div>
          <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
            {['A', 'B', 'C', 'D', 'F'].map(function(g) {
              var count = distribution[g] || 0;
              var pct = (count / sorted.length) * 100;
              if (pct === 0) return null;
              return (
                <div key={g} style={{
                  width: pct + '%', background: getGradeColor(g),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.6rem', fontWeight: 700, color: '#fff',
                  minWidth: count > 0 ? 20 : 0,
                }}>
                  {count > 0 ? g : ''}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {['A', 'B', 'C', 'D', 'F'].map(function(g) {
              return (
                <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: getGradeColor(g) }} />
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>{g}: {distribution[g] || 0}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 16, overflowX: 'auto',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr>
              {['Ticker', 'Score', 'Grade', 'Key Risk', 'Yield', 'Payout Ratio'].map(function(label) {
                return (
                  <th key={label} style={{
                    textAlign: 'left', padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    color: 'var(--text-dim)', fontWeight: 500, fontSize: '0.7rem',
                    textTransform: 'uppercase', letterSpacing: '0.03em',
                    whiteSpace: 'nowrap',
                  }}>
                    {label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map(function(s) {
              var gc = getGradeColor(s.grade);
              // Find the weakest factor
              var weakestFactor = s.factors.length > 0
                ? s.factors.reduce(function(min, f) { return f.score < min.score ? f : min; }, s.factors[0])
                : null;

              return (
                <tr key={s.ticker} style={{ borderBottom: '1px solid var(--border-row)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {s.ticker}
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-primary)', fontWeight: 600 }}>
                    {Math.round(s.score)}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px',
                      background: gc + '1a', color: gc,
                      border: '1px solid ' + gc + '4d',
                      borderRadius: 4, fontSize: '0.65rem', fontWeight: 700,
                    }}>
                      {s.grade}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {weakestFactor ? weakestFactor.name + ' (' + Math.round(weakestFactor.score) + ')' : '-'}
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-primary)' }}>
                    {s.yield != null ? s.yield.toFixed(2) + '%' : '-'}
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)' }}>
                    {s.payoutRatio != null ? (s.payoutRatio * 100).toFixed(1) + '%' : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Score Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 12,
      }}>
        {sorted.map(function(s) {
          return (
            <SafetyScoreCard
              key={s.ticker}
              ticker={s.ticker}
              score={s.score}
              grade={s.grade}
              factors={s.factors}
            />
          );
        })}
      </div>
    </div>
  );
}
