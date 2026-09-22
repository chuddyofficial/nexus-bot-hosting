import { useEffect, useRef, useState } from 'react';
import api from '../api/client';

const MAX_POINTS = 60;

function formatUptime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function Sparkline({ points, max, color }) {
  const width = 480;
  const height = 56;
  if (points.length < 2) {
    return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} />;
  }
  const stepX = width / (MAX_POINTS - 1);
  const scaleY = (v) => height - (Math.min(v, max) / max) * height;
  const offset = MAX_POINTS - points.length;
  const path = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(offset + i) * stepX} ${scaleY(v)}`).join(' ');
  const area = `${path} L ${(offset + points.length - 1) * stepX} ${height} L ${offset * stepX} ${height} Z`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={area} fill={color} opacity="0.14" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

export default function MetricsPanel({ botId, running }) {
  const [stats, setStats] = useState(null);
  const [cpuHistory, setCpuHistory] = useState([]);
  const [memHistory, setMemHistory] = useState([]);
  const intervalRef = useRef(null);

  useEffect(() => {
    setCpuHistory([]);
    setMemHistory([]);
    setStats(null);

    if (!running) return;

    async function poll() {
      try {
        const { data } = await api.get(`/bots/${botId}/stats`);
        if (data.running) {
          setStats(data);
          setCpuHistory((h) => [...h, data.cpuPercent].slice(-MAX_POINTS));
          setMemHistory((h) => [...h, data.memoryUsedMb].slice(-MAX_POINTS));
        }
      } catch { /* transient */ }
    }
    poll();
    intervalRef.current = setInterval(poll, 2000);
    return () => clearInterval(intervalRef.current);
  }, [botId, running]);

  if (!running) {
    return (
      <div style={{ padding: '24px 28px', color: 'var(--app-text-dim)', fontSize: 13.5 }}>
        Start the bot to see live resource metrics.
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 580, overflowY: 'auto' }}>
      <div className="app-eyebrow" style={{ marginBottom: 4 }}>Live metrics</div>
      <h3 style={{ fontSize: 15, marginBottom: 18 }}>Resource usage</h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        <Tile label="Uptime" value={stats ? formatUptime(stats.uptimeSeconds) : '—'} />
        <Tile label="CPU" value={stats ? `${stats.cpuPercent}%` : '—'} />
        <Tile label="Memory" value={stats ? `${stats.memoryUsedMb} MB` : '—'} />
      </div>

      <div className="app-card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--app-text-faint)', marginBottom: 8 }}>
          <span>CPU %</span>
          <span>{stats ? `${stats.cpuPercent}%` : ''}</span>
        </div>
        <Sparkline points={cpuHistory} max={100} color="#6e76ff" />
      </div>

      <div className="app-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--app-text-faint)', marginBottom: 8 }}>
          <span>Memory (MB)</span>
          <span>{stats ? `${stats.memoryUsedMb} / ${stats.memoryLimitMb} MB` : ''}</span>
        </div>
        <Sparkline points={memHistory} max={stats?.memoryLimitMb || 256} color="#3dd68c" />
      </div>

      {stats && stats.restartCount > 0 && (
        <p style={{ fontSize: 12, color: 'var(--app-text-faint)', marginTop: 18 }}>
          Restarted {stats.restartCount} time{stats.restartCount === 1 ? '' : 's'} since creation.
        </p>
      )}
    </div>
  );
}

function Tile({ label, value }) {
  return (
    <div className="app-card" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--app-accent)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 10.5, color: 'var(--app-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{label}</div>
    </div>
  );
}
