import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppNav from '../components/AppNav';
import CreateBotModal from '../components/CreateBotModal';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

const RUNTIME_TAG = { python: 'PY', node: 'JS' };

export default function Dashboard() {
  const [bots, setBots] = useState([]);
  const [limit, setLimit] = useState(5);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  async function loadBots() {
    setLoading(true);
    const { data } = await api.get('/bots');
    setBots(data.bots);
    setLimit(data.limit);
    setLoading(false);
  }

  useEffect(() => { loadBots(); }, []);

  return (
    <div>
      <AppNav />
      <div className="container" style={{ padding: '32px 24px' }}>
        {user && !user.emailVerified && (
          <div className="alert alert-info">verify your email address to unlock all features</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>ls ~/bots</div>
            <h1 style={{ margin: 0, fontSize: 24 }}>
              {bots.length}<span style={{ color: 'var(--text-faint)' }}>/{limit}</span> slots used
            </h1>
          </div>
          <button className="btn btn-primary" disabled={bots.length >= limit} onClick={() => setShowCreate(true)}>
            + run create-bot
          </button>
        </div>

        {loading ? (
          <p className="prompt">loading…</p>
        ) : bots.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '52px 24px' }}>
            <div style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 4 }}>~/bots is empty</div>
            <h3 style={{ margin: '0 0 16px', fontWeight: 600 }}>No bots deployed yet</h3>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>run create-bot</button>
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border)' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '28px 1fr 100px 140px 1fr',
              gap: 12, padding: '9px 16px', fontSize: 11, color: 'var(--text-faint)',
              textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)'
            }}>
              <span></span>
              <span>name</span>
              <span>runtime</span>
              <span>status</span>
              <span>entry</span>
            </div>
            {bots.map((bot, i) => (
              <div
                key={bot.id}
                onClick={() => navigate(`/bots/${bot.id}`)}
                style={{
                  display: 'grid', gridTemplateColumns: '28px 1fr 100px 140px 1fr',
                  gap: 12, padding: '13px 16px', alignItems: 'center',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                  cursor: 'pointer', fontSize: 13, transition: 'background 0.1s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 22, borderRadius: 2, fontSize: 10, fontWeight: 800,
                  background: 'var(--surface-2)', color: 'var(--text-dim)', border: '1px solid var(--border-bright)'
                }}>
                  {RUNTIME_TAG[bot.runtime]}
                </span>
                <span style={{ fontWeight: 600 }}>{bot.name}</span>
                <span style={{ color: 'var(--text-dim)' }}>{bot.runtime}</span>
                <span className={`badge badge-${bot.status}`} style={{ justifySelf: 'start' }}>
                  <span className="dot" />{bot.status}
                </span>
                <span style={{ color: 'var(--text-faint)' }}>{bot.entryFile || '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateBotModal
          onClose={() => setShowCreate(false)}
          onCreated={(bot) => { setShowCreate(false); navigate(`/bots/${bot.id}`); }}
        />
      )}
    </div>
  );
}
