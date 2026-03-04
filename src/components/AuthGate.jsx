import React from 'react';
import { ClerkProvider, SignedIn, SignedOut, SignIn, SignUp } from '@clerk/clerk-react';
import { CLERK_PUBLISHABLE_KEY } from '../config';
import ErrorBoundary from './ErrorBoundary';
import App from '../App';

const clerkAppearance = {
  variables: {
    colorPrimary: '#005EB8',
    colorBackground: '#0a1628',
    colorText: '#c8dff0',
    colorTextSecondary: '#7a9ab8',
    colorInputBackground: 'rgba(255,255,255,0.04)',
    colorInputText: '#c8dff0',
    borderRadius: '0px',
    fontFamily: "'EB Garamond', Georgia, serif",
  },
  elements: {
    card: {
      background: '#0a1628',
      border: '1px solid #1a3a5c',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    },
    headerTitle: {
      fontFamily: "'Playfair Display', Georgia, serif",
      color: '#c8dff0',
    },
    headerSubtitle: {
      color: '#7a9ab8',
    },
    socialButtonsBlockButton: {
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid #1a3a5c',
      color: '#c8dff0',
    },
    formFieldInput: {
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      color: '#c8dff0',
    },
    formButtonPrimary: {
      background: '#005EB8',
      fontWeight: 700,
    },
    footerActionLink: {
      color: '#005EB8',
    },
    dividerLine: {
      background: '#1a3a5c',
    },
    dividerText: {
      color: '#2a4a6a',
    },
  },
};

function LoginPage() {
  const [mode, setMode] = React.useState('signIn');

  return (
    <div style={{
      minHeight: '100vh',
      background: '#020817',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'EB Garamond', Georgia, serif",
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 32, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 9, height: 9, background: '#005EB8',
          boxShadow: '0 0 8px #10b981',
        }} />
        <span style={{ fontWeight: 800, fontSize: '1.4rem', letterSpacing: '-0.02em', color: '#c8dff0' }}>
          Safe<span style={{ color: '#005EB8' }}>Yield</span>
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
          color: '#005EB8',
          cursor: 'pointer',
          fontSize: '0.9rem',
          fontFamily: "'EB Garamond', Georgia, serif",
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
