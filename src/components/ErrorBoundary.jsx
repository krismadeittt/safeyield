import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#020817', color: '#c8dff0',
        fontFamily: "'EB Garamond', Georgia, serif",
      }}>
        <div style={{ textAlign: 'center', maxWidth: 400, padding: '2rem' }}>
          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontWeight: 700, fontStyle: 'italic', color: '#005EB8',
            fontSize: '1.5rem', marginBottom: '1rem',
          }}>
            SafeYield
          </div>
          <p style={{ color: '#7a9ab8', marginBottom: '1.5rem' }}>
            Something went wrong. Please refresh the page.
          </p>
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
