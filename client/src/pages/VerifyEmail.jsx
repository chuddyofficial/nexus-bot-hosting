import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Logo from '../components/Logo';
import api from '../api/client';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!token) { setStatus('error'); return; }
    api.post('/auth/verify-email', { token })
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <div className="landing-scope" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <Link to="/"><Logo size={38} /></Link>
        </div>
        <div className="card">
          {status === 'loading' && <p className="prompt">verifying email…</p>}
          {status === 'success' && (
            <>
              <div className="alert alert-success">email verified</div>
              <Link to="/dashboard" className="btn btn-primary">go to dashboard</Link>
            </>
          )}
          {status === 'error' && (
            <>
              <div className="alert alert-error">this verification link is invalid or has expired</div>
              <Link to="/login" className="btn btn-secondary">back to login</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
