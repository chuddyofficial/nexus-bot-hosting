import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import AppLogo from './AppLogo';
import RuntimeTag from './ui/RuntimeTag';
import { useAuth } from '../context/AuthContext';
import { useBots } from '../context/BotsContext';

const BOT_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'editor', label: 'Editor' },
  { key: 'console', label: 'Console' },
  { key: 'metrics', label: 'Metrics' },
  { key: 'startup', label: 'Startup' },
  { key: 'settings', label: 'Settings' },
  { key: 'sftp', label: 'SFTP' }
];

function Icon({ name }) {
  const paths = {
    dashboard: 'M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z',
    bot: 'M12 2a2 2 0 0 1 2 2v1h2a2 2 0 0 1 2 2v3h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v3a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-3H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1V7a2 2 0 0 1 2-2h2V4a2 2 0 0 1 2-2zM9 12a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
    account: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6z',
    admin: 'M12 2l8 3v6c0 5-3.4 8.7-8 11-4.6-2.3-8-6-8-11V5l8-3z',
    plus: 'M12 5v14M5 12h14'
  };
  return (
    <svg className="app-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  );
}

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const { bots } = useBots();
  const location = useLocation();
  const params = useParams();
  const navigate = useNavigate();

  const activeBotId = params.id;

  return (
    <div className="app-scope app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar-header">
          <Link to="/dashboard"><AppLogo size={26} /></Link>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div className="app-nav-section">
            <Link
              to="/dashboard"
              className={`app-nav-item ${location.pathname === '/dashboard' ? 'active' : ''}`}
            >
              <Icon name="dashboard" />
              Dashboard
            </Link>
          </div>

          <div className="app-nav-section">
            <div className="app-nav-label">Bots</div>
            {bots.map((bot) => {
              const isActiveBot = activeBotId === bot.id;
              return (
                <div key={bot.id}>
                  <div
                    className={`app-nav-item ${isActiveBot && !location.pathname.includes('/dashboard') ? 'active' : ''}`}
                    onClick={() => navigate(`/bots/${bot.id}`)}
                  >
                    <Icon name="bot" />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{bot.name}</span>
                    <RuntimeTag runtime={bot.runtime} size={18} />
                  </div>
                  {isActiveBot && (
                    <div className="app-nav-sub">
                      {BOT_TABS.map((tab) => (
                        <Link
                          key={tab.key}
                          to={`/bots/${bot.id}?tab=${tab.key}`}
                          className={`app-nav-item ${location.search === `?tab=${tab.key}` || (tab.key === 'overview' && !location.search) ? 'active' : ''}`}
                        >
                          {tab.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <Link to="/dashboard" className="app-nav-item" style={{ color: 'var(--app-accent)' }}>
              <Icon name="plus" />
              New bot
            </Link>
          </div>

          {user?.isAdmin && (
            <div className="app-nav-section">
              <div className="app-nav-label">Platform</div>
              <Link to="/admin" className={`app-nav-item ${location.pathname === '/admin' ? 'active' : ''}`}>
                <Icon name="admin" />
                Admin
              </Link>
            </div>
          )}
        </div>

        <div className="app-sidebar-footer">
          <Link to="/account" className={`app-nav-item ${location.pathname === '/account' ? 'active' : ''}`}>
            <Icon name="account" />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</span>
          </Link>
          <button
            className="app-btn app-btn-ghost app-btn-sm"
            style={{ width: '100%', justifyContent: 'flex-start', marginTop: 2 }}
            onClick={() => { logout(); navigate('/login'); }}
          >
            Log out
          </button>
        </div>
      </aside>

      <div className="app-content">{children}</div>
    </div>
  );
}
