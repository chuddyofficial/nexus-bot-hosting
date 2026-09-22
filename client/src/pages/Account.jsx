import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppNav from '../components/AppNav';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Account() {
  const { user, refresh, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div>
      <AppNav />
      <div className="container" style={{ padding: '32px 24px', maxWidth: 640 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>account --settings</div>
        <h1 style={{ margin: '0 0 24px', fontSize: 22 }}>{user?.email}</h1>

        <ProfileSection user={user} onUpdated={refresh} />
        <EmailSection user={user} onUpdated={refresh} />
        <PasswordSection />
        <DangerSection onDeleted={() => { logout(); navigate('/'); }} />
      </div>
    </div>
  );
}

function ProfileSection({ user, onUpdated }) {
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [username, setUsername] = useState(user?.username || '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.put('/auth/account/profile', { displayName, username: username || null });
      await onUpdated();
      setSuccess('saved');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>profile</div>
      <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>display name &amp; username</h3>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}
      <form onSubmit={save}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label">display_name</label>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} minLength={2} maxLength={64} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label">username</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="optional" maxLength={32} />
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" disabled={busy}>save profile</button>
      </form>
    </div>
  );
}

function EmailSection({ user, onUpdated }) {
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/account/change-email', { newEmail, currentPassword });
      setMessage(data.message);
      setNewEmail('');
      setCurrentPassword('');
      await onUpdated();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to request email change.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>email</div>
      <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>change-email --confirm</h3>
      <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 0, marginBottom: 16 }}>
        current: {user?.email}
        {user?.pendingEmail && <> &middot; pending confirmation: {user.pendingEmail}</>}
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      <form onSubmit={submit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label">new_email</label>
            <input className="input" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label">current_password</label>
            <input className="input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" disabled={busy}>send confirmation link</button>
      </form>
    </div>
  );
}

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.put('/auth/account/password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setSuccess('password updated');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>security</div>
      <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>change password</h3>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}
      <form onSubmit={submit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label">current_password</label>
            <input className="input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label">new_password</label>
            <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" disabled={busy}>update password</button>
      </form>
    </div>
  );
}

function DangerSection({ onDeleted }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.delete('/auth/account', { data: { currentPassword } });
      onDeleted();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete account.');
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ borderColor: '#4a2424' }}>
      <div className="eyebrow" style={{ marginBottom: 8, color: 'var(--err)' }}>danger zone</div>
      <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>delete account</h3>
      <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 0, marginBottom: 16 }}>
        permanently deletes your account and every bot you own. this cannot be undone.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      {!confirming ? (
        <button className="btn btn-danger btn-sm" onClick={() => setConfirming(true)}>delete my account</button>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
            <label className="field-label">confirm with password</label>
            <input className="input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoFocus />
          </div>
          <button className="btn btn-danger btn-sm" disabled={busy}>{busy ? 'deleting…' : 'permanently delete'}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>cancel</button>
        </form>
      )}
    </div>
  );
}
