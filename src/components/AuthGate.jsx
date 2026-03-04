import React from 'react';
import { ClerkProvider, SignedIn, SignedOut, SignIn, SignUp } from '@clerk/clerk-react';
import { CLERK_PUBLISHABLE_KEY } from '../config';
import ErrorBoundary from './ErrorBoundary';
import App from '../App';

const clerkAppearance = {
  variables: {
    colorPrimary: 'var(--primary)',
    colorBackground: 'var(--bg-card)',
    colorText: 'var(--text-primary)',
    colorTextSecondary: 'var(--text-muted)',
    colorInputBackground: 'rgba(255,255,255,0.04)',
    colorInputText: 'var(--text-primary)',
    borderRadius: '0px',
    fontFamily: "'DM Sans', system-ui, sans-serif",
  },
  elements: {
    card: {
      background: 'var(--bg-card)',
      border: '1px solid var(--border-accent)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    },
    headerTitle: {
      fontFamily: "'DM Sans', system-ui, sans-serif",
      color: 'var(--text-primary)',
    },
    headerSubtitle: {
      color: 'var(--text-muted)',
    },
    socialButtonsBlockButton: {
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid var(--border-accent)',
      color: 'var(--text-primary)',
    },
    formFieldInput: {
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      color: 'var(--text-primary)',
    },
    formButtonPrimary: {
      background: 'var(--primary)',
      fontWeight: 700,
    },
    footerActionLink: {
      color: 'var(--primary)',
    },
    dividerLine: {
      background: 'var(--border-accent)',
    },
    dividerText: {
      color: 'var(--text-dim)',
    },
  },
};

function LoginPage() {
  const [mode, setMode] = React.useState('signIn');

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 32, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 9, height: 9, background: 'var(--primary)',
          boxShadow: '0 0 8px #10b981',
        }} />
        <span style={{ fontWeight: 800, fontSize: '1.4rem', letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
          Safe<span style={{ color: 'var(--primary)' }}>Yield</span>
        </span>
      </div>

      {mode === 'signIn' ? (
        <SignIn
          appearance={clerkAppearance}
          routing="hash"
          signUpUrl="#sign-up"
          afterSignInUrl="/"
        />
      ) : (
        <SignUp
          appearance={clerkAppearance}
          routing="hash"
          signInUrl="#sign-in"
          afterSignUpUrl="/"
        />
      )}

      <button
        onClick={() => setMode(m => m === 'signIn' ? 'signUp' : 'signIn')}
        style={{
          marginTop: 16,
          background: 'none',
          border: 'none',
          color: 'var(--primary)',
          cursor: 'pointer',
          fontSize: '0.9rem',
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}
      >
        {mode === 'signIn' ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}

export default function AuthGate() {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <SignedOut>
        <LoginPage />
      </SignedOut>
      <SignedIn>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </SignedIn>
    </ClerkProvider>
  );
}
