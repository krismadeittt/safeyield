import React, { useState } from 'react';
import { UserButton, useUser } from '@clerk/clerk-react';
import ProfileModal from './ProfileModal';

export default function UserMenu({ getToken, dripEnabled, toggleDrip, onShowTour }) {
  const { user } = useUser();
  const [showProfile, setShowProfile] = useState(false);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => setShowProfile(true)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-link)', fontSize: '0.75rem',
            fontFamily: "'EB Garamond', Georgia, serif",
          }}
        >
          {user?.firstName || 'Profile'}
        </button>
        <UserButton
          appearance={{
            elements: {
              avatarBox: { width: 28, height: 28 },
              userButtonPopoverCard: {
                background: 'var(--bg-card)',
                border: '1px solid var(--border-accent)',
              },
            },
          }}
        />
      </div>
      {showProfile && (
        <ProfileModal
          getToken={getToken}
          onClose={() => setShowProfile(false)}
          dripEnabled={dripEnabled}
          toggleDrip={toggleDrip}
          onShowTour={onShowTour}
        />
      )}
    </>
  );
}
