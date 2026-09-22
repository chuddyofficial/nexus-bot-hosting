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
    <div className="landing-scope" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <Link to="/"><Logo size={38} /></Link>
        </div>
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 8 }}>account recovery</div>
          <h2 style={{ marginTop: 0, marginBottom: 4, fontSize: 20 }}>reset-password --request</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 0, marginBottom: 20 }}>
            # we'll email a one-time reset link
          </p>

          {message ? (
            <div className="alert alert-success">{message}</div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label className="field-label">email</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" required />
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                {loading ? 'sending…' : 'send reset link'}
              </button>
            </form>
          )}

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-dim)' }}>
            <Link to="/login" style={{ color: 'var(--amber)' }}>&larr; back to login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
