import { useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import api from '../api/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/request-password-reset', { email });
      setMessage(data.message);
    } catch {
      setMessage('If that email is registered, a reset link has been sent.');
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
          <h2 style={{ marginTop: 0 }}>Reset your password</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 14, marginTop: -8 }}>
            Enter your email and we'll send you a reset link.
          </p>

          {message ? (
            <div className="alert alert-success">{message}</div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label className="field-label">Email</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" required />
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          )}

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'var(--text-dim)' }}>
            <Link to="/login" style={{ color: 'var(--accent-2)' }}>Back to log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
