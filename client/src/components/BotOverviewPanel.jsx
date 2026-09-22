import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import Card from './ui/Card';
import StatusBadge from './ui/StatusBadge';

function formatUptime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function timeAgo(ts) {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function BotOverviewPanel({ bot, botId }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (bot.status !== 'running') { setStats(null); return; }
    let cancelled = false;
    api.get(`/bots/${botId}/stats`).then(({ data }) => { if (!cancelled && data.running) setStats(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [botId, bot.status]);

  return (
    <div style={{ padding: '24px 28px', maxWidth: 720, overflowY: 'auto' }}>
      <div className="app-eyebrow" style={{ marginBottom: 4 }}>Overview</div>
      <h3 style={{ fontSize: 15, marginBottom: 18 }}>At a glance</h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        <Card style={{ padding: '14px 16px' }}>
          <div style={{ marginBottom: 6 }}><StatusBadge status={bot.status} /></div>
          <div style={{ fontSize: 10.5, color: 'var(--app-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</div>
        </Card>
        <Card style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--app-accent)', fontVariantNumeric: 'tabular-nums' }}>
            {stats ? formatUptime(stats.uptimeSeconds) : '—'}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--app-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>Uptime</div>
        </Card>
        <Card style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--app-text)', fontVariantNumeric: 'tabular-nums' }}>
            {bot.restartCount ?? 0}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--app-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>Restarts</div>
        </Card>
        <Card style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--app-text)', fontVariantNumeric: 'tabular-nums' }}>
            {timeAgo(bot.lastStartedAt)}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--app-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>Last started</div>
        </Card>
      </div>

      <Card style={{ marginBottom: 14 }}>
        <div className="app-eyebrow" style={{ marginBottom: 10 }}>Configuration</div>
        <Row label="Runtime" value={bot.runtime === 'python' ? 'Python 3.12' : 'Node.js 20'} />
        <Row label="Entry file" value={bot.entryFile || 'not set'} />
        <Row label="Start command" value={bot.startCommand || 'default'} />
        <Row label="Restart policy" value={bot.restartPolicy || 'never'} />
        <Row label="Auto-start on boot" value={bot.autoStart ? 'Enabled' : 'Disabled'} />
        <Row label="CPU limit" value={bot.cpuLimit ? `${bot.cpuLimit} cores` : 'platform default'} last />
      </Card>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link className="app-btn app-btn-secondary app-btn-sm" to={`/bots/${botId}?tab=editor`}>Open editor</Link>
        <Link className="app-btn app-btn-secondary app-btn-sm" to={`/bots/${botId}?tab=console`}>View console</Link>
        <Link className="app-btn app-btn-secondary app-btn-sm" to={`/bots/${botId}?tab=metrics`}>Metrics</Link>
      </div>
    </div>
  );
}

function Row({ label, value, last }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 13,
      padding: '8px 0', borderBottom: last ? 'none' : '1px solid var(--app-border)'
    }}>
      <span style={{ color: 'var(--app-text-dim)' }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  );
}
