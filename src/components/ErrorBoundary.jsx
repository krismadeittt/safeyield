import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const err = this.state.error;
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#020817', color: '#c8dff0',
        fontFamily: "'EB Garamond', Georgia, serif",
      }}>
        <div style={{ textAlign: 'center', maxWidth: 600, padding: '2rem' }}>
          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontWeight: 700, fontStyle: 'italic', color: '#005EB8',
            fontSize: '1.5rem', marginBottom: '1rem',
          }}>
            SafeYield
          </div>
          <p style={{ color: '#7a9ab8', marginBottom: '1rem' }}>
            Something went wrong. Please refresh the page.
          </p>
          <pre style={{ color: '#ff6666', fontSize: '0.7rem', textAlign: 'left', background: '#0a1020', padding: '1rem', marginBottom: '1rem', overflowX: 'auto', maxHeight: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {err ? `${err.name}: ${err.message}\n${err.stack}` : 'Unknown error'}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px', cursor: 'pointer',
              background: '#005EB8', color: '#c8dff0',
              border: 'none', fontSize: '0.9rem',
              fontFamily: "'EB Garamond', Georgia, serif",
            }}
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }
}
