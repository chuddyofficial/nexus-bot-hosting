import { useEffect, useState } from 'react';
import AppNav from '../components/AppNav';
import api from '../api/client';

export default function Admin() {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadUsers() {
    const { data } = await api.get('/admin/users');
    setUsers(data.users);
  }

  async function loadBots() {
    const { data } = await api.get('/admin/bots');
    setBots(data.bots);
  }

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      await Promise.all([loadUsers(), loadBots()]);
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
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    }
  }

  async function editLimit(u) {
    const input = prompt(`Bot limit override for ${u.email} (blank = default limit):`, u.botLimitOverride ?? '');
    if (input === null) return;
    setError('');
    try {
      await api.put(`/admin/users/${u.id}/bot-limit`, { limit: input.trim() === '' ? null : input.trim() });
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    }
  }

  async function deleteUser(u) {
    if (!confirm(`Permanently delete "${u.email}" and all their bots? This cannot be undone.`)) return;
    setError('');
    try {
      await api.delete(`/admin/users/${u.id}`);
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    }
  }

  async function stopBot(bot) {
    setError('');
    try {
      await api.post(`/admin/bots/${bot.id}/stop`);
      await loadBots();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    }
  }

  async function deleteBot(bot) {
    if (!confirm(`Permanently delete "${bot.name}" (owned by ${bot.ownerEmail})?`)) return;
    setError('');
    try {
      await api.delete(`/admin/bots/${bot.id}`);
      await loadBots();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    }
  }

  return (
    <div>
      <AppNav />
      <div className="container" style={{ padding: '32px 24px' }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>admin --panel</div>
        <h1 style={{ margin: '0 0 20px', fontSize: 24 }}>platform control</h1>

        {error && <div className="alert alert-error">{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button className={`btn btn-sm ${tab === 'users' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('users')}>
            users ({users.length})
          </button>
          <button className={`btn btn-sm ${tab === 'bots' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('bots')}>
            bots ({bots.length})
          </button>
        </div>

        {loading ? (
          <p className="prompt">loading…</p>
        ) : tab === 'users' ? (
          <div style={{ border: '1px solid var(--border)', overflowX: 'auto' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1.6fr 1fr 70px 70px 90px 1fr', gap: 12,
              padding: '9px 16px', fontSize: 11, color: 'var(--text-faint)',
              textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)',
              minWidth: 760
            }}>
              <span>email</span>
              <span>username</span>
              <span>bots</span>
              <span>admin</span>
              <span>status</span>
              <span>actions</span>
            </div>
            {users.map((u, i) => (
              <div key={u.id} style={{
                display: 'grid', gridTemplateColumns: '1.6fr 1fr 70px 70px 90px 1fr', gap: 12,
                padding: '11px 16px', alignItems: 'center', fontSize: 13,
                borderTop: i === 0 ? 'none' : '1px solid var(--border)', minWidth: 760
              }}>
                <span>{u.email}</span>
                <span style={{ color: 'var(--text-dim)' }}>{u.username || '—'}</span>
                <span>{u.botCount}{u.botLimitOverride != null ? `/${u.botLimitOverride}` : ''}</span>
                <span>{u.isAdmin ? <span className="badge badge-created">admin</span> : '—'}</span>
                <span className={`badge ${u.disabled ? 'badge-error' : 'badge-running'}`}>
                  <span className="dot" />{u.disabled ? 'disabled' : 'active'}
                </span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px' }} onClick={() => editLimit(u)}>limit</button>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px' }} onClick={() => toggleDisabled(u)}>
                    {u.disabled ? 'enable' : 'disable'}
                  </button>
                  {!u.isAdmin && (
                    <button className="btn btn-danger btn-sm" style={{ padding: '2px 8px' }} onClick={() => deleteUser(u)}>delete</button>
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border)', overflowX: 'auto' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 90px 110px 1fr', gap: 12,
              padding: '9px 16px', fontSize: 11, color: 'var(--text-faint)',
              textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)',
              minWidth: 700
            }}>
              <span>bot</span>
              <span>owner</span>
              <span>runtime</span>
              <span>status</span>
              <span>actions</span>
            </div>
            {bots.map((bot, i) => (
              <div key={bot.id} style={{
                display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 90px 110px 1fr', gap: 12,
                padding: '11px 16px', alignItems: 'center', fontSize: 13,
                borderTop: i === 0 ? 'none' : '1px solid var(--border)', minWidth: 700
              }}>
                <span style={{ fontWeight: 600 }}>{bot.name}</span>
                <span style={{ color: 'var(--text-dim)' }}>{bot.ownerEmail}</span>
                <span>{bot.runtime}</span>
                <span className={`badge badge-${bot.status}`}><span className="dot" />{bot.status}</span>
                <span style={{ display: 'flex', gap: 6 }}>
                  {bot.status === 'running' && (
                    <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px' }} onClick={() => stopBot(bot)}>stop</button>
                  )}
                  <button className="btn btn-danger btn-sm" style={{ padding: '2px 8px' }} onClick={() => deleteBot(bot)}>delete</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
