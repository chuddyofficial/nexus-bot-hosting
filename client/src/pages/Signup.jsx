import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Signup() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/signup', { displayName, email, password });
      login(data.token, data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
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
          <div className="eyebrow" style={{ marginBottom: 8 }}>new account</div>
          <h2 style={{ marginTop: 0, marginBottom: 4, fontSize: 20 }}>create-account --plan=free</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 0, marginBottom: 20 }}># up to 5 bot slots, no card required</p>

          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label className="field-label">display_name</label>
              <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jane Doe" required minLength={2} maxLength={64} />
            </div>
            <div className="field">
              <label className="field-label">email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" required />
            </div>
            <div className="field">
              <label className="field-label">password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="8+ characters" required minLength={8} />
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'creating…' : 'run create-account'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-dim)' }}>
            already have an account? <Link to="/login" style={{ color: 'var(--amber)' }}>log in &rarr;</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
