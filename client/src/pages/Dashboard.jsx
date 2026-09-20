import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppNav from '../components/AppNav';
import CreateBotModal from '../components/CreateBotModal';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

const STATUS_LABEL = { running: 'Running', stopped: 'Stopped', created: 'Created', error: 'Error' };

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
          <div className="alert alert-info">
            Please check your inbox to verify your email address.
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: '0 0 4px' }}>Your Bots</h1>
            <p style={{ margin: 0, color: 'var(--text-dim)' }}>{bots.length} / {limit} bots used</p>
          </div>
          <button className="btn btn-primary" disabled={bots.length >= limit} onClick={() => setShowCreate(true)}>
            + Create Bot
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-dim)' }}>Loading…</p>
        ) : bots.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 60 }}>
            <h3>No bots yet</h3>
            <p style={{ color: 'var(--text-dim)' }}>Create your first server to get started.</p>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Create your first server</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {bots.map((bot) => (
              <div key={bot.id} className="card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/bots/${bot.id}`)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h3 style={{ margin: '0 0 4px' }}>{bot.name}</h3>
                  <span className={`badge badge-${bot.status}`}><span className="dot" />{STATUS_LABEL[bot.status] || bot.status}</span>
                </div>
                <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '4px 0 0' }}>
                  {bot.runtime === 'python' ? '🐍 Python' : '⬢ Node.js'} &middot; entry: {bot.entryFile || 'not set'}
                </p>
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
