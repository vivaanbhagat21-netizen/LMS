import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../context/ThemeContext';
import './AppShell.css';

const commonNavItems = [
  { path: '/dashboard',  label: 'Dashboard',   icon: '📊' },
  { path: '/classrooms', label: 'Classrooms',   icon: '🏫' },
  { path: '/tutorials',  label: 'Handouts',     icon: '📚' },
  { path: '/tasks',      label: 'Assignments',  icon: '📋' },
  { path: '/service-action', label: 'Service & Action', icon: '🌱' },
  { path: '/grades',     label: 'Grades',       icon: '🎓' },
  { path: '/schedule',   label: 'Schedule',     icon: '📅' },
  { path: '/discussions',label: 'Discussions',  icon: '💬' },
  { path: '/settings',   label: 'Settings',     icon: '⚙️' },
];

const teacherNavItems = [
  { path: '/attendance', label: 'Attendance',   icon: '🗓️' },
];

export function AppShell() {
  const { user, logout, loading } = useAuth();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo-wrapper">
            <svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="50" fill="#002D9C"/>
              <text x="50" y="66" font-family="Arial, sans-serif" font-size="55" font-weight="bold" fill="white" text-anchor="middle">e</text>
            </svg>
          </div>
          <div>
            <h1 className="brand-title">Edugen</h1>
            <p className="brand-subtitle">Learning workspace</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          {/* Common nav items (all roles) */}
          {commonNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}

          {/* Teacher-only nav items */}
          {user?.role === 'teacher' && (
            <>
              <div style={{ margin: '6px 0 4px 0', padding: '0 14px', fontSize: '0.68rem', fontWeight: '800', color: 'var(--muted)', letterSpacing: '0.08em', opacity: 0.6 }}>
                TEACHER TOOLS
              </div>
              {teacherNavItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* Sidebar Footer User Card with Settings & Theme Controls */}
        <div className="sidebar-footer">
          <div className="user-profile-summary">
            <img
              src={user?.avatar || '/default-avatar.svg'}
              alt={user?.name || 'User'}
              className="user-avatar"
            />
            <div className="user-info">
              <div className="user-name">{user?.name || 'Guest'}</div>
              <div className="user-role-badge">
                {user?.role ? user.role.toUpperCase() : 'USER'}
              </div>
            </div>

            {/* Quick Dark/Light Mode Switcher button */}
            <button
              type="button"
              className="theme-quick-btn"
              onClick={toggleDarkMode}
              title={isDarkMode ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            >
              {isDarkMode ? '☀️' : '🌙'}
            </button>
          </div>

          <div className="sidebar-footer-actions">
            <button
              type="button"
              className="settings-quick-button"
              onClick={() => navigate('/settings')}
            >
              ⚙️ Settings
            </button>

            <button className="logout-button" onClick={logout} disabled={loading}>
              🚪 Logout
            </button>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
