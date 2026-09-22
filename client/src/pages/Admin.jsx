import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import Card from '../components/ui/Card';
import StatusBadge from '../components/ui/StatusBadge';
import ConfirmModal from '../components/ui/ConfirmModal';
import Modal from '../components/ui/Modal';
import { SkeletonCard } from '../components/ui/Skeleton';
import api from '../api/client';
import { useToast } from '../context/ToastContext';

export default function Admin() {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [bots, setBots] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [limitModal, setLimitModal] = useState(null);
  const [limitValue, setLimitValue] = useState('');
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(null);
  const [confirmDeleteBot, setConfirmDeleteBot] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function loadUsers() {
    const { data } = await api.get('/admin/users');
    setUsers(data.users);
  }

  async function loadBots() {
    const { data } = await api.get('/admin/bots');
    setBots(data.bots);
  }

  async function loadOverview() {
    const { data } = await api.get('/admin/overview');
    setOverview(data);
  }

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      await Promise.all([loadUsers(), loadBots(), loadOverview()]);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function toggleDisabled(u) {
    setError('');
    try {
      await api.post(`/admin/users/${u.id}/${u.disabled ? 'enable' : 'disable'}`);
      await loadUsers();
      toast.success(u.disabled ? `${u.email} enabled.` : `${u.email} disabled.`);
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    }
  }

  function openLimitModal(u) {
    setLimitValue(u.botLimitOverride ?? '');
    setLimitModal(u);
  }

  async function submitLimit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.put(`/admin/users/${limitModal.id}/bot-limit`, { limit: limitValue.trim() === '' ? null : limitValue.trim() });
      await loadUsers();
      toast.success(`Bot limit updated for ${limitModal.email}.`);
      setLimitModal(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    }
  }

  async function deleteUserNow() {
    const u = confirmDeleteUser;
    setBusy(true);
    setError('');
    try {
      await api.delete(`/admin/users/${u.id}`);
      await loadAll();
      toast.success(`${u.email} deleted.`);
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    } finally {
      setBusy(false);
      setConfirmDeleteUser(null);
    }
  }

  async function stopBot(bot) {
    setError('');
    try {
      await api.post(`/admin/bots/${bot.id}/stop`);
      await loadBots();
      toast.success(`${bot.name} stopped.`);
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    }
  }

  async function deleteBotNow() {
    const bot = confirmDeleteBot;
    setBusy(true);
    setError('');
    try {
      await api.delete(`/admin/bots/${bot.id}`);
      await loadBots();
      toast.success(`${bot.name} deleted.`);
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    } finally {
      setBusy(false);
      setConfirmDeleteBot(null);
    }
  }

  return (
    <AppShell>
      <div style={{ padding: '32px 40px', maxWidth: 1080 }}>
        <div className="app-eyebrow" style={{ marginBottom: 6 }}>Admin</div>
        <h1 style={{ fontSize: 24, marginBottom: 20 }}>Platform control</h1>

        {error && <div className="app-alert app-alert-error">{error}</div>}

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
            <SkeletonCard lines={1} /><SkeletonCard lines={1} /><SkeletonCard lines={1} /><SkeletonCard lines={1} /><SkeletonCard lines={1} />
          </div>
        ) : overview && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
            <StatTile label="Total users" value={overview.totalUsers} />
            <StatTile label="Disabled" value={overview.disabledUsers} accent={overview.disabledUsers > 0 ? 'var(--app-warn)' : undefined} />
            <StatTile label="Total bots" value={overview.totalBots} />
            <StatTile label="Running" value={overview.runningBots} accent="var(--app-ok)" />
            <StatTile label="CPU / Memory" value={`${overview.cpuPercent}% · ${overview.memoryUsedMb}MB`} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button className={`app-btn app-btn-sm ${tab === 'users' ? 'app-btn-primary' : 'app-btn-secondary'}`} onClick={() => setTab('users')}>
            Users ({users.length})
          </button>
          <button className={`app-btn app-btn-sm ${tab === 'bots' ? 'app-btn-primary' : 'app-btn-secondary'}`} onClick={() => setTab('bots')}>
            Bots ({bots.length})
          </button>
        </div>

        {loading ? (
          <SkeletonCard lines={4} />
        ) : tab === 'users' ? (
          users.length === 0 ? (
            <Card style={{ textAlign: 'center', padding: '40px 24px', color: 'var(--app-text-dim)' }}>No users yet.</Card>
          ) : (
          <Card style={{ padding: 0, overflowX: 'auto' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1.6fr 1fr 70px 70px 90px 1fr', gap: 12,
              padding: '11px 18px', fontSize: 11, color: 'var(--app-text-faint)',
              textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--app-border)',
              minWidth: 760
            }}>
              <span>Email</span>
              <span>Username</span>
              <span>Bots</span>
              <span>Admin</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {users.map((u, i) => (
              <div key={u.id} style={{
                display: 'grid', gridTemplateColumns: '1.6fr 1fr 70px 70px 90px 1fr', gap: 12,
                padding: '12px 18px', alignItems: 'center', fontSize: 13,
                borderTop: i === 0 ? 'none' : '1px solid var(--app-border)', minWidth: 760
              }}>
                <span>{u.email}</span>
                <span style={{ color: 'var(--app-text-dim)' }}>{u.username || '—'}</span>
                <span>{u.botCount}{u.botLimitOverride != null ? `/${u.botLimitOverride}` : ''}</span>
                <span>{u.isAdmin ? <span className="app-badge app-badge-created">Admin</span> : '—'}</span>
                <StatusBadge status={u.disabled ? 'error' : 'running'} style={{ width: 'fit-content' }} />
                <span style={{ display: 'flex', gap: 6 }}>
                  <button className="app-btn app-btn-ghost app-btn-sm" style={{ padding: '2px 8px' }} onClick={() => openLimitModal(u)}>Limit</button>
                  <button className="app-btn app-btn-ghost app-btn-sm" style={{ padding: '2px 8px' }} onClick={() => toggleDisabled(u)}>
                    {u.disabled ? 'Enable' : 'Disable'}
                  </button>
                  {!u.isAdmin && (
                    <button className="app-btn app-btn-danger app-btn-sm" style={{ padding: '2px 8px' }} onClick={() => setConfirmDeleteUser(u)}>Delete</button>
                  )}
                </span>
              </div>
            ))}
          </Card>
          )
        ) : bots.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: '40px 24px', color: 'var(--app-text-dim)' }}>No bots on the platform yet.</Card>
        ) : (
          <Card style={{ padding: 0, overflowX: 'auto' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 90px 110px 1fr', gap: 12,
              padding: '11px 18px', fontSize: 11, color: 'var(--app-text-faint)',
              textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--app-border)',
              minWidth: 700
            }}>
              <span>Bot</span>
              <span>Owner</span>
              <span>Runtime</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {bots.map((bot, i) => (
              <div key={bot.id} style={{
                display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 90px 110px 1fr', gap: 12,
                padding: '12px 18px', alignItems: 'center', fontSize: 13,
                borderTop: i === 0 ? 'none' : '1px solid var(--app-border)', minWidth: 700
              }}>
                <span style={{ fontWeight: 600 }}>{bot.name}</span>
                <span style={{ color: 'var(--app-text-dim)' }}>{bot.ownerEmail}</span>
                <span>{bot.runtime}</span>
                <StatusBadge status={bot.status} style={{ width: 'fit-content' }} />
                <span style={{ display: 'flex', gap: 6 }}>
                  {bot.status === 'running' && (
                    <button className="app-btn app-btn-ghost app-btn-sm" style={{ padding: '2px 8px' }} onClick={() => stopBot(bot)}>Stop</button>
                  )}
                  <button className="app-btn app-btn-danger app-btn-sm" style={{ padding: '2px 8px' }} onClick={() => setConfirmDeleteBot(bot)}>Delete</button>
                </span>
              </div>
            ))}
          </Card>
        )}
      </div>

      {limitModal && (
        <Modal onClose={() => setLimitModal(null)} maxWidth={380}>
          <form onSubmit={submitLimit}>
            <h2 style={{ fontSize: 16, marginBottom: 4 }}>Bot limit override</h2>
            <p style={{ color: 'var(--app-text-dim)', fontSize: 13, marginTop: 0, marginBottom: 16 }}>{limitModal.email}</p>
            <div className="app-field">
              <label className="app-field-label">Limit (blank = platform default)</label>
              <input className="app-input" autoFocus type="number" min="0" value={limitValue} onChange={(e) => setLimitValue(e.target.value)} placeholder="5" />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <button type="button" className="app-btn app-btn-ghost" onClick={() => setLimitModal(null)}>Cancel</button>
              <button type="submit" className="app-btn app-btn-primary">Save</button>
            </div>
          </form>
        </Modal>
      )}

      {confirmDeleteUser && (
        <ConfirmModal
          title={`Delete "${confirmDeleteUser.email}"?`}
          message="This permanently deletes the user and all their bots and containers. This cannot be undone."
          confirmLabel="Delete user"
          busy={busy}
          onConfirm={deleteUserNow}
          onCancel={() => setConfirmDeleteUser(null)}
        />
      )}

      {confirmDeleteBot && (
        <ConfirmModal
          title={`Delete "${confirmDeleteBot.name}"?`}
          message={`Owned by ${confirmDeleteBot.ownerEmail}. This permanently deletes the bot and its files.`}
          confirmLabel="Delete bot"
          busy={busy}
          onConfirm={deleteBotNow}
          onCancel={() => setConfirmDeleteBot(null)}
        />
      )}
    </AppShell>
  );
}

function StatTile({ label, value, accent }) {
  return (
    <Card style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: accent || 'var(--app-text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 10.5, color: 'var(--app-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{label}</div>
    </Card>
  );
}
