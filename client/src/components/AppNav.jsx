import { Link, useNavigate } from 'react-router-dom';
import Logo from './Logo';
import { useAuth } from '../context/AuthContext';

export default function AppNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <nav style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px' }}>
        <Link to="/dashboard"><Logo size={30} /></Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 14, color: 'var(--text-dim)' }}>{user?.displayName}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => { logout(); navigate('/login'); }}>
            Log Out
          </button>
        </div>
      </div>
    </nav>
  );
}
