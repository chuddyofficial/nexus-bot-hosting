import { useEffect, useRef, useState } from 'react';
import api from '../api/client';
import Card from './ui/Card';
import Sparkline, { MAX_POINTS } from './ui/Sparkline';

export default function DashboardMetrics({ bots }) {
  const [cpuTotal, setCpuTotal] = useState(0);
  const [memTotal, setMemTotal] = useState(0);
  const [cpuHistory, setCpuHistory] = useState([]);
  const [memHistory, setMemHistory] = useState([]);
  const intervalRef = useRef(null);

  const runningBots = bots.filter((b) => b.status === 'running');
  const runningIds = runningBots.map((b) => b.id).join(',');

  useEffect(() => {
    if (runningBots.length === 0) {
      setCpuTotal(0); setMemTotal(0); setCpuHistory([]); setMemHistory([]);
      return;
    }

    async function poll() {
      const results = await Promise.all(
        runningBots.map((b) => api.get(`/bots/${b.id}/stats`).then(({ data }) => data).catch(() => null))
      );
      let cpu = 0, mem = 0;
      for (const r of results) {
        if (r?.running) { cpu += r.cpuPercent; mem += r.memoryUsedMb; }
      }
      setCpuTotal(cpu);
      setMemTotal(mem);
      setCpuHistory((h) => [...h, cpu].slice(-MAX_POINTS));
      setMemHistory((h) => [...h, mem].slice(-MAX_POINTS));
    }
    poll();
    intervalRef.current = setInterval(poll, 3000);
    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningIds]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
      <Tile label="Total bots" value={bots.length} />
      <Tile label="Running" value={runningBots.length} accent="var(--app-ok)" />
      <Card style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <div style={{ fontSize: 10.5, color: 'var(--app-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>CPU</div>
          <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{cpuTotal.toFixed(1)}%</div>
        </div>
        <Sparkline points={cpuHistory} max={Math.max(100, cpuTotal)} color="#6e76ff" height={32} />
      </Card>
      <Card style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <div style={{ fontSize: 10.5, color: 'var(--app-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Memory</div>
          <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{memTotal} MB</div>
        </div>
        <Sparkline points={memHistory} max={Math.max(256, memTotal)} color="#3dd68c" height={32} />
      </Card>
    </div>
  );
}

function Tile({ label, value, accent }) {
  return (
    <Card style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || 'var(--app-text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 10.5, color: 'var(--app-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{label}</div>
    </Card>
  );
}
