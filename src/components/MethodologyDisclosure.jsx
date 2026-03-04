import React, { useState } from 'react';
import useIsMobile from '../hooks/useIsMobile';

const SECTIONS = [
  {
    title: 'Data Sources',
    content: 'Market prices and dividend data are sourced from EODHD Financial APIs. Prices are delayed by approximately 15 minutes during market hours. Historical dividend and price data covers up to 20 years where available.',
  },
  {
    title: 'Real vs Projected Data',
    content: 'Historical bars (green) represent actual market data. Projected bars (blue) are forward-looking estimates based on current fundamentals and growth rates. Projections assume dividend growth continues at the trailing 5-year average rate.',
  },
  {
    title: 'Growth Assumptions',
    content: 'Projected portfolio returns assume a 7% average annual total return (based on long-term US equity averages). Dividend growth uses each stock\'s individual 5-year compound annual growth rate (CAGR). These are estimates and actual returns may vary significantly.',
  },
  {
    title: 'DRIP Simulation',
    content: 'When DRIP is enabled, dividends are assumed to be reinvested at the prevailing share price each quarter. The DRIP Advantage metric shows the cumulative benefit of reinvestment vs. collecting cash dividends over the projection period.',
  },
  {
    title: 'Payout Ratio',
    content: 'Payout ratio is calculated as annual dividends per share divided by earnings per share (GAAP). When the GAAP payout exceeds 100%, we fall back to the Free Cash Flow (FCF) payout ratio if available, as it better reflects dividend sustainability for capital-intensive businesses and REITs.',
  },
];

export default function MethodologyDisclosure() {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  return (
    <div style={{
      background: '#0a1628', border: '1px solid #1a3a5c',
      marginTop: '1.5rem',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label="Toggle methodology and data sources"
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: isMobile ? '0.8rem' : '1rem 1.5rem',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: '#7a9ab8', fontFamily: "'EB Garamond', Georgia, serif",
        }}
      >
        <span style={{
          fontWeight: 600, letterSpacing: '0.12em', fontSize: '0.72rem',
          textTransform: 'uppercase',
        }}>
          Methodology & Data Sources
        </span>
        <span style={{ fontSize: '0.8rem', color: '#5a8ab0', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>
          ▼
        </span>
      </button>

      {open && (
        <div style={{
          padding: isMobile ? '0 0.8rem 0.8rem' : '0 1.5rem 1.5rem',
          borderTop: '1px solid #0a1e30',
        }}>
          {SECTIONS.map((s, i) => (
            <div key={i} style={{ marginTop: '1rem' }}>
              <div style={{
                fontSize: '0.7rem', color: '#5a8ab0', letterSpacing: '0.1em',
                textTransform: 'uppercase', marginBottom: '0.3rem',
                fontFamily: "'EB Garamond', Georgia, serif", fontWeight: 600,
              }}>
                {s.title}
              </div>
              <div style={{
                fontSize: '0.82rem', color: '#7a9ab8', lineHeight: 1.5,
                fontFamily: "'EB Garamond', Georgia, serif",
              }}>
                {s.content}
              </div>
            </div>
          ))}
          <div style={{
            marginTop: '1rem', fontSize: '0.7rem', color: '#3a5a78',
            fontStyle: 'italic', fontFamily: "Georgia, serif",
          }}>
            SafeYield is for informational and educational purposes only and does not constitute investment advice.
            Past performance does not guarantee future results. All data is provided on a 15-minute delay.
          </div>
        </div>
      )}
    </div>
  );
}
