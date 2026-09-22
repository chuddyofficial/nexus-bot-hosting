import { useEffect, useRef, useState } from 'react';

export default function LiveConsole({ botId, active }) {
  const [lines, setLines] = useState('');
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const wsRef = useRef(null);
  const outputRef = useRef(null);

  useEffect(() => {
    if (!active) return;

    const token = localStorage.getItem('nexus_token');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/console?botId=${botId}&token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'log') {
          setLines((prev) => prev + msg.data);
        } else if (msg.type === 'error') {
          setLines((prev) => prev + `\n[console error] ${msg.message}\n`);
        }
      } catch { /* ignore malformed frames */ }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [botId, active]);

  useEffect(() => {
    if (autoScroll && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  function handleScroll() {
    const el = outputRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(nearBottom);
  }

  function clear() {
    setLines('');
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '9px 16px', borderBottom: '1px solid var(--app-border)', fontSize: 12
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: connected ? 'var(--app-ok)' : 'var(--app-text-faint)' }}>
          <span className="app-dot" />
          {connected ? 'Live' : 'Disconnected'}
        </span>
        <button className="app-btn app-btn-ghost app-btn-sm" onClick={clear}>Clear</button>
      </div>
      <div
        ref={outputRef}
        onScroll={handleScroll}
        style={{
          flex: 1, background: '#0a0b0d', color: '#7ee787', fontFamily: 'var(--mono)',
          fontSize: 12.5, padding: 16, overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.7
        }}
      >
        {lines || '// No output yet — start the bot to stream logs here.'}
      </div>
    </div>
  );
}
