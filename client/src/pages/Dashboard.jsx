import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import CreateBotModal from '../components/CreateBotModal';
import DashboardMetrics from '../components/DashboardMetrics';
import Card from '../components/ui/Card';
import StatusBadge from '../components/ui/StatusBadge';
import RuntimeTag from '../components/ui/RuntimeTag';
import { SkeletonCard } from '../components/ui/Skeleton';
import { useAuth } from '../context/AuthContext';
import { useBots } from '../context/BotsContext';

export default function Dashboard() {
  const { bots, limit, loading, refresh } = useBots();
  const [showCreate, setShowCreate] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <AppShell>
      <div style={{ padding: '32px 40px', maxWidth: 1040, width: '100%', boxSizing: 'border-box' }}>
        {user && !user.emailVerified && (
          <div className="app-alert app-alert-info">Verify your email address to unlock all features.</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="app-eyebrow" style={{ marginBottom: 6 }}>Your bots</div>
            <h1 style={{ fontSize: 26 }}>
              {bots.length}<span style={{ color: 'var(--app-text-faint)' }}>/{limit}</span> slots used
            </h1>
          </div>
          <button className="app-btn app-btn-primary" disabled={bots.length >= limit} onClick={() => setShowCreate(true)}>
            + Create bot
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        ) : bots.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: '56px 24px' }}>
            <h3 style={{ marginBottom: 8, fontSize: 17 }}>No bots yet</h3>
            <p style={{ color: 'var(--app-text-dim)', fontSize: 13.5, marginBottom: 20 }}>
              Create your first bot to get a Python or Node.js runtime with its own container.
            </p>
            <button className="app-btn app-btn-primary" onClick={() => setShowCreate(true)}>Create your first bot</button>
          </Card>
        ) : (
          <>
            <DashboardMetrics bots={bots} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {bots.map((bot) => (
                <Card
                  key={bot.id}
                  style={{ cursor: 'pointer', transition: 'border-color 0.12s ease' }}
                  onClick={() => navigate(`/bots/${bot.id}`)}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--app-border-bright)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--app-border)'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <RuntimeTag runtime={bot.runtime} />
                    <StatusBadge status={bot.status} />
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{bot.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--app-text-faint)' }}>
                    {bot.entryFile || 'no entry file set'}
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <CreateBotModal
          onClose={() => setShowCreate(false)}
          onCreated={async (bot) => { setShowCreate(false); await refresh(); navigate(`/bots/${bot.id}`); }}
        />
      )}
    </AppShell>
  );
}
