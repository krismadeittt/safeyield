import React, { useState } from 'react';
import useIsMobile from '../hooks/useIsMobile';

function LegalModal({ title, onClose, children }) {
  const isMobile = useIsMobile();
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'var(--bg-overlay)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-accent)',
        padding: isMobile ? '1.5rem' : '2rem',
        width: isMobile ? 'calc(100vw - 2rem)' : 480,
        maxWidth: 480, maxHeight: '80vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          fontWeight: 600, letterSpacing: '0.12em', fontSize: '0.72rem',
          textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '1rem',
          fontFamily: "'EB Garamond', Georgia, serif",
        }}>
          {title}
        </div>
        <div style={{
          fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6,
          fontFamily: "'EB Garamond', Georgia, serif",
        }}>
          {children}
        </div>
        <button onClick={onClose} style={{
          marginTop: '1.5rem', padding: '8px 20px', cursor: 'pointer',
          background: 'transparent', border: '1px solid var(--border-accent)',
          color: 'var(--text-link)', fontSize: '0.85rem',
          fontFamily: "'EB Garamond', Georgia, serif",
        }}>
          Close
        </button>
      </div>
    </div>
  );
}

export default function LegalFooter() {
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const linkStyle = {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-link)', fontSize: '0.7rem',
    fontFamily: "'EB Garamond', Georgia, serif",
    textDecoration: 'underline', padding: 0,
  };

  return (
    <>
      <div style={{
        marginTop: '2rem', padding: '1.5rem 0', borderTop: '1px solid var(--border-dim)',
        textAlign: 'center', fontFamily: "'EB Garamond', Georgia, serif",
      }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-sub)', marginBottom: '0.5rem' }}>
          SafeYield is for informational purposes only. Not investment advice.
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem' }}>
          <button onClick={() => setShowTerms(true)} style={linkStyle}>Terms of Service</button>
          <span style={{ color: 'var(--text-sub)', fontSize: '0.7rem' }}>|</span>
          <button onClick={() => setShowPrivacy(true)} style={linkStyle}>Privacy Policy</button>
        </div>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-sub)' }}>
          Data provided by EODHD. 15-minute delay.
        </div>
      </div>

      {showTerms && (
        <LegalModal title="Terms of Service" onClose={() => setShowTerms(false)}>
          <p style={{ marginBottom: '0.8rem' }}>
            SafeYield is provided for informational and educational purposes only. Nothing on this site constitutes investment advice, a recommendation, or a solicitation to buy or sell any security.
          </p>
          <p style={{ marginBottom: '0.8rem' }}>
            Market data is sourced from third-party providers and is not guaranteed to be accurate, complete, or timely. Prices are delayed by approximately 15 minutes during market hours.
          </p>
          <p style={{ marginBottom: '0.8rem' }}>
            SafeYield and its creators are not liable for any losses or damages arising from the use of this tool or reliance on the data presented. All investment decisions are made at your own risk.
          </p>
          <p>
            By using SafeYield, you acknowledge that you assume all responsibility for your investment decisions and that past performance does not guarantee future results.
          </p>
        </LegalModal>
      )}

      {showPrivacy && (
        <LegalModal title="Privacy Policy" onClose={() => setShowPrivacy(false)}>
          <p style={{ marginBottom: '0.8rem' }}>
            Authentication is handled by Clerk. Please refer to{' '}
            <a href="https://clerk.com/legal/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-link)' }}>
              Clerk's Privacy Policy
            </a>{' '}
            for details on how authentication data is processed.
          </p>
          <p style={{ marginBottom: '0.8rem' }}>
            SafeYield stores the following user data: display name, portfolio holdings, and strategy preference. This data is stored securely and used solely to provide the service.
          </p>
          <p style={{ marginBottom: '0.8rem' }}>
            We do not sell, share, or distribute your personal data to third parties.
          </p>
          <p>
            Cookies are used for authentication purposes only.
          </p>
        </LegalModal>
      )}
    </>
  );
}
