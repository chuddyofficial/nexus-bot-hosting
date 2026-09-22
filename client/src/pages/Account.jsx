import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Account() {
  const { user, refresh, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <AppShell>
      <div style={{ padding: '32px 40px', maxWidth: 640 }}>
        <div className="app-eyebrow" style={{ marginBottom: 6 }}>Account settings</div>
        <h1 style={{ fontSize: 24, marginBottom: 24 }}>{user?.email}</h1>

        <ProfileSection user={user} onUpdated={refresh} />
        <EmailSection user={user} onUpdated={refresh} />
        <PasswordSection />
        <DangerSection onDeleted={() => { logout(); navigate('/'); }} />
      </div>
    </AppShell>
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
      setSuccess('Saved.');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-card" style={{ marginBottom: 20 }}>
      <div className="app-eyebrow" style={{ marginBottom: 4 }}>Profile</div>
      <h3 style={{ fontSize: 15, marginBottom: 16 }}>Display name &amp; username</h3>
      {error && <div className="app-alert app-alert-error">{error}</div>}
      {success && <div className="app-alert app-alert-success">{success}</div>}
      <form onSubmit={save}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div className="app-field" style={{ marginBottom: 0 }}>
            <label className="app-field-label">Display name</label>
            <input className="app-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} minLength={2} maxLength={64} />
          </div>
          <div className="app-field" style={{ marginBottom: 0 }}>
            <label className="app-field-label">Username</label>
            <input className="app-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="optional" maxLength={32} />
          </div>
        </div>
        <button className="app-btn app-btn-secondary app-btn-sm" disabled={busy}>Save profile</button>
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
    <div className="app-card" style={{ marginBottom: 20 }}>
      <div className="app-eyebrow" style={{ marginBottom: 4 }}>Email</div>
      <h3 style={{ fontSize: 15, marginBottom: 6 }}>Change email address</h3>
      <p style={{ fontSize: 12, color: 'var(--app-text-faint)', marginTop: 0, marginBottom: 16 }}>
        Current: {user?.email}
        {user?.pendingEmail && <> &middot; pending confirmation: {user.pendingEmail}</>}
      </p>
      {error && <div className="app-alert app-alert-error">{error}</div>}
      {message && <div className="app-alert app-alert-success">{message}</div>}
      <form onSubmit={submit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div className="app-field" style={{ marginBottom: 0 }}>
            <label className="app-field-label">New email</label>
            <input className="app-input" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
          </div>
          <div className="app-field" style={{ marginBottom: 0 }}>
            <label className="app-field-label">Current password</label>
            <input className="app-input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </div>
        </div>
        <button className="app-btn app-btn-secondary app-btn-sm" disabled={busy}>Send confirmation link</button>
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
      setSuccess('Password updated.');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-card" style={{ marginBottom: 20 }}>
      <div className="app-eyebrow" style={{ marginBottom: 4 }}>Security</div>
      <h3 style={{ fontSize: 15, marginBottom: 16 }}>Change password</h3>
      {error && <div className="app-alert app-alert-error">{error}</div>}
      {success && <div className="app-alert app-alert-success">{success}</div>}
      <form onSubmit={submit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div className="app-field" style={{ marginBottom: 0 }}>
            <label className="app-field-label">Current password</label>
            <input className="app-input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </div>
          <div className="app-field" style={{ marginBottom: 0 }}>
            <label className="app-field-label">New password</label>
            <input className="app-input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          </div>
        </div>
        <button className="app-btn app-btn-secondary app-btn-sm" disabled={busy}>Update password</button>
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
    <div className="app-card" style={{ borderColor: 'rgba(240,85,77,0.35)' }}>
      <div className="app-eyebrow" style={{ marginBottom: 4, color: 'var(--app-err)' }}>Danger zone</div>
      <h3 style={{ fontSize: 15, marginBottom: 8 }}>Delete account</h3>
      <p style={{ fontSize: 12, color: 'var(--app-text-faint)', marginTop: 0, marginBottom: 16 }}>
        Permanently deletes your account and every bot you own. This cannot be undone.
      </p>
      {error && <div className="app-alert app-alert-error">{error}</div>}
      {!confirming ? (
        <button className="app-btn app-btn-danger app-btn-sm" onClick={() => setConfirming(true)}>Delete my account</button>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="app-field" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
            <label className="app-field-label">Confirm with password</label>
            <input className="app-input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoFocus />
          </div>
          <button className="app-btn app-btn-danger app-btn-sm" disabled={busy}>{busy ? 'Deleting…' : 'Permanently delete'}</button>
          <button type="button" className="app-btn app-btn-ghost app-btn-sm" onClick={() => setConfirming(false)}>Cancel</button>
        </form>
      )}
    </div>
  );
}
