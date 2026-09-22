import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Logo from '../components/Logo';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function ConfirmEmailChange() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState('loading');
  const { refresh } = useAuth();

  useEffect(() => {
    if (!token) { setStatus('error'); return; }
    api.post('/auth/account/confirm-email-change', { token })
      .then(() => { refresh(); setStatus('success'); })
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <Link to="/"><Logo size={38} /></Link>
        </div>
        <div className="card">
          {status === 'loading' && <p className="prompt">confirming email change…</p>}
          {status === 'success' && (
            <>
              <div className="alert alert-success">email address updated</div>
              <Link to="/account" className="btn btn-primary">go to account</Link>
            </>
          )}
          {status === 'error' && (
            <>
              <div className="alert alert-error">this confirmation link is invalid or has expired</div>
              <Link to="/account" className="btn btn-secondary">back to account</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
