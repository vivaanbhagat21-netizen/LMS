import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useTheme, ThemeMode } from '../context/ThemeContext';
import { useLocalStorageState } from '../utils/useLocalStorageState';

interface UserPreferences {
  emailNotifs: boolean;
  dueDateReminders: boolean;
  discussionAlerts: boolean;
  soundEffects: boolean;
}

export function SettingsPage() {
  const { user } = useAuth();
  const { theme, setTheme, isDarkMode, toggleDarkMode } = useTheme();

  const [prefs, setPrefs] = useLocalStorageState<UserPreferences>('edugen_user_prefs', {
    emailNotifs: true,
    dueDateReminders: true,
    discussionAlerts: true,
    soundEffects: false,
  });

  const [saveStatus, setSaveStatus] = useState('');

  const themesList: { id: ThemeMode; name: string; icon: string; previewBg: string; previewAccent: string }[] = [
    {
      id: 'light',
      name: 'Light Ocean',
      icon: '☀️',
      previewBg: '#f8fafc',
      previewAccent: '#4f46e5',
    },
    {
      id: 'dark',
      name: 'Dark Slate',
      icon: '🌙',
      previewBg: '#0f172a',
      previewAccent: '#6366f1',
    },
    {
      id: 'emerald',
      name: 'Emerald Sage',
      icon: '🌿',
      previewBg: '#f0fdf4',
      previewAccent: '#059669',
    },
    {
      id: 'sunset',
      name: 'Sunset Amber',
      icon: '🌅',
      previewBg: '#fff7ed',
      previewAccent: '#ea580c',
    },
    {
      id: 'midnight',
      name: 'Midnight Cyber',
      icon: '🌌',
      previewBg: '#090d16',
      previewAccent: '#ec4899',
    },
  ];

  const handleTogglePref = (key: keyof UserPreferences) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
    setSaveStatus('Preferences saved automatically.');
    setTimeout(() => setSaveStatus(''), 2000);
  };

  return (
    <section className="page-section settings-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2>⚙️ Account & Personalization Settings</h2>
          <p>Customize your workspace theme, dark mode preferences, and notification alerts.</p>
        </div>
      </div>

      {/* Quick Dark Mode Toggle Card */}
      <div className="panel-card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '1.2rem' }}>
              {isDarkMode ? '🌙 Dark Mode Active' : '☀️ Light Mode Active'}
            </h3>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
              Switch between dark slate colors and crisp light workspace themes.
            </p>
          </div>

          <button
            type="button"
            onClick={toggleDarkMode}
            className="primary-button"
            style={{ width: 'auto', padding: '12px 24px', fontSize: '0.95rem' }}
          >
            {isDarkMode ? '☀️ Switch to Light Mode' : '🌙 Enable Dark Mode'}
          </button>
        </div>
      </div>

      {/* Personalization & Themes Section */}
      <div className="panel-card" style={{ marginBottom: '24px' }}>
        <h3>🎨 Theme Customization</h3>
        <p style={{ marginBottom: '18px', color: 'var(--muted)', fontSize: '0.92rem' }}>
          Select a color theme accent that matches your study preference. Changes apply live across all pages.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '16px',
          }}
        >
          {themesList.map((t) => {
            const isSelected = theme === t.id;
            return (
              <div
                key={t.id}
                onClick={() => setTheme(t.id)}
                style={{
                  background: t.previewBg,
                  border: isSelected ? `3px solid ${t.previewAccent}` : '1px solid var(--border)',
                  borderRadius: '18px',
                  padding: '16px',
                  cursor: 'pointer',
                  boxShadow: isSelected ? `0 6px 20px rgba(0,0,0,0.15)` : 'var(--shadow-sm)',
                  transition: 'all 0.25s ease',
                  position: 'relative',
                }}
              >
                {isSelected && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '10px',
                      right: '10px',
                      background: t.previewAccent,
                      color: 'white',
                      borderRadius: '50%',
                      width: '22px',
                      height: '22px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                    }}
                  >
                    ✓
                  </span>
                )}

                <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>{t.icon}</div>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', color: t.id === 'dark' || t.id === 'midnight' ? '#f8fafc' : '#0f172a' }}>
                  {t.name}
                </h4>
                <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                  <span
                    style={{
                      width: '24px',
                      height: '10px',
                      borderRadius: '4px',
                      background: t.previewAccent,
                    }}
                  />
                  <span
                    style={{
                      width: '24px',
                      height: '10px',
                      borderRadius: '4px',
                      background: t.previewBg === '#0f172a' ? '#334155' : '#e2e8f0',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Account Details & Role */}
      <div className="panel-grid">
        <div className="panel-card">
          <h3>👤 User Profile</h3>
          <div className="profile-card">
            <img
              src={user?.avatar || '/default-avatar.svg'}
              alt={user?.name || 'User'}
              className="avatar"
            />
            <div>
              <p style={{ margin: '0 0 6px 0' }}>
                <strong>Name:</strong> {user?.name || 'Guest'}
              </p>
              <p style={{ margin: '0 0 6px 0' }}>
                <strong>Email:</strong> {user?.email || 'N/A'}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Role:</strong> {user?.role ? user.role.toUpperCase() : 'STUDENT'}
              </p>
            </div>
          </div>
        </div>

        {/* Notifications & System Preferences */}
        <div className="panel-card">
          <h3>🔔 Workspace Preferences</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <div>
                <strong>Assignment Reminders</strong>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>
                  Receive alerts when tasks are approaching due date
                </p>
              </div>
              <input
                type="checkbox"
                checked={prefs.dueDateReminders}
                onChange={() => handleTogglePref('dueDateReminders')}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <div>
                <strong>Discussion & Reply Alerts</strong>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>
                  Get notified when teachers or peers post in classroom threads
                </p>
              </div>
              <input
                type="checkbox"
                checked={prefs.discussionAlerts}
                onChange={() => handleTogglePref('discussionAlerts')}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <div>
                <strong>Sound Effects</strong>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>
                  Play audio feedback on task submission
                </p>
              </div>
              <input
                type="checkbox"
                checked={prefs.soundEffects}
                onChange={() => handleTogglePref('soundEffects')}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              />
            </label>
          </div>

          {saveStatus && (
            <p style={{ color: 'var(--accent)', fontSize: '0.85rem', fontWeight: '600', marginTop: '12px' }}>
              {saveStatus}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
