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
  const height = 60;
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
      <path d={area} fill={color} opacity="0.12" />
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
      <div style={{ padding: 20, color: 'var(--text-faint)', fontSize: 13 }}>
        start the bot to see live resource metrics
      </div>
    );
  }

  return (
    <div style={{ padding: 20, maxWidth: 560, overflowY: 'auto' }}>
      <div className="eyebrow" style={{ marginBottom: 14 }}>live metrics</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--border)', border: '1px solid var(--border)', marginBottom: 24 }}>
        <Tile label="uptime" value={stats ? formatUptime(stats.uptimeSeconds) : '—'} />
        <Tile label="cpu" value={stats ? `${stats.cpuPercent}%` : '—'} />
        <Tile label="memory" value={stats ? `${stats.memoryUsedMb} mb` : '—'} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-faint)', marginBottom: 6 }}>
          <span>CPU %</span>
          <span>{stats ? `${stats.cpuPercent}%` : ''}</span>
        </div>
        <Sparkline points={cpuHistory} max={100} color="#ffb000" />
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-faint)', marginBottom: 6 }}>
          <span>Memory (MB)</span>
          <span>{stats ? `${stats.memoryUsedMb} / ${stats.memoryLimitMb} mb` : ''}</span>
        </div>
        <Sparkline points={memHistory} max={stats?.memoryLimitMb || 256} color="#5fad65" />
      </div>

      {stats && stats.restartCount > 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 20 }}>
          restarted {stats.restartCount} time{stats.restartCount === 1 ? '' : 's'} since creation
        </p>
      )}
    </div>
  );
}

function Tile({ label, value }) {
  return (
    <div style={{ background: 'var(--bg)', padding: '14px 14px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--amber)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 10.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{label}</div>
    </div>
  );
}
