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
          {user?.isAdmin && (
            <Link to="/admin" className="btn btn-ghost btn-sm">admin</Link>
          )}
          <Link to="/account" className="btn btn-ghost btn-sm">account</Link>
          <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>{user?.email}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => { logout(); navigate('/login'); }}>
            log out
          </button>
        </div>
      </div>
    </nav>
  );
}
