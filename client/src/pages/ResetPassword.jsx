import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Logo from '../components/Logo';
import api from '../api/client';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <Link to="/"><Logo size={38} /></Link>
        </div>
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 8 }}>account recovery</div>
          <h2 style={{ marginTop: 0, marginBottom: 20, fontSize: 20 }}>reset-password --confirm</h2>

          {error && <div className="alert alert-error">{error}</div>}
          {done ? (
            <div className="alert alert-success">password updated — redirecting to login…</div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label className="field-label">new_password</label>
                <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="8+ characters" required minLength={8} />
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading || !token}>
                {loading ? 'updating…' : 'update password'}
              </button>
              {!token && <p style={{ color: 'var(--err)', fontSize: 13, marginTop: 10 }}>missing reset token — use the link from your email</p>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
