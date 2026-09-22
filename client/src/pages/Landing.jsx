import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Logo from '../components/Logo';

const BOOT_LINES = [
  'nexus-hosting boot sequence v1.0',
  'checking runtime images ....... python:3.12-slim  node:20-slim  OK',
  'checking sandbox isolation ..... docker / per-bot containers  OK',
  'checking database engine ....... sqlite, one file per bot  OK',
  'checking capacity .............. 5 bot slots / account  OK',
  'ready.'
];

const RUNTIMES = [
  { cmd: 'runtime', val: 'python3.12 / node20', note: 'pick one per bot at creation' },
  { cmd: 'isolation', val: 'docker container', note: 'own cpu, memory and pid limits' },
  { cmd: 'storage', val: 'sqlite (per bot)', note: 'no shared tables between users' },
  { cmd: 'editor', val: 'monaco, in-browser', note: 'the vs code editor, no ssh needed' },
  { cmd: 'upload', val: '.zip, unzip in place', note: 'or drag in individual files' },
  { cmd: 'price', val: '$0 / 5 bots', note: 'no card, no trial clock' }
];

export default function Landing() {
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    if (visibleLines >= BOOT_LINES.length) return;
    const t = setTimeout(() => setVisibleLines((v) => v + 1), visibleLines === 0 ? 200 : 180);
    return () => clearTimeout(t);
  }, [visibleLines]);

  return (
    <div>
      <nav className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
        <Logo size={32} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/login" className="btn btn-ghost btn-sm">log in</Link>
          <Link to="/signup" className="btn btn-primary btn-sm">create account</Link>
        </div>
      </nav>

      <header className="container" style={{ padding: '64px 24px 40px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(280px, 420px)', gap: 48, alignItems: 'start' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 14 }}>bot.chnexus.net — free hosting</div>
          <h1 style={{ fontSize: 40, lineHeight: 1.25, margin: '0 0 20px', fontWeight: 700 }}>
            Run your Python and<br />Node bots on hardware<br />you don't have to manage.
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-dim)', maxWidth: 480, margin: '0 0 32px', lineHeight: 1.7 }}>
            Sign up, pick a runtime, upload your code. Nexus gives every account
            five isolated bot containers, an in-browser editor, and a private
            database per bot — free, no credit card.
          </p>
          <div style={{ display: 'flex', gap: 10, marginBottom: 40 }}>
            <Link to="/signup" className="btn btn-primary">
              create account &rarr;
            </Link>
            <Link to="/login" className="btn btn-secondary">
              i have an account
            </Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--border)', border: '1px solid var(--border)', maxWidth: 480 }}>
            {[['5', 'bots / account'], ['2', 'runtimes'], ['0', 'cost']].map(([n, label]) => (
              <div key={label} style={{ background: 'var(--bg)', padding: '16px 14px' }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--amber)' }}>{n}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: '#000', border: '1px solid var(--border-bright)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#4a4438' }} />
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#4a4438' }} />
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#4a4438' }} />
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-faint)' }}>status.log</span>
          </div>
          <div style={{ padding: '18px 16px', fontSize: 12.5, lineHeight: 1.9, minHeight: 210 }}>
            {BOOT_LINES.slice(0, visibleLines).map((line, i) => (
              <div key={i} style={{ color: i === BOOT_LINES.length - 1 ? 'var(--ok)' : 'var(--text-dim)' }}>
                {i === BOOT_LINES.length - 1 && visibleLines === BOOT_LINES.length ? '✓ ' : '  '}
                {line}
              </div>
            ))}
            {visibleLines < BOOT_LINES.length && (
              <span style={{ display: 'inline-block', width: 7, height: 14, background: 'var(--amber)', animation: 'blink 1s step-start infinite' }} />
            )}
          </div>
        </div>
      </header>

      <section className="container" style={{ padding: '20px 24px 80px' }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>spec</div>
        <div style={{ border: '1px solid var(--border)' }}>
          {RUNTIMES.map((r, i) => (
            <div
              key={r.cmd}
              style={{
                display: 'grid',
                gridTemplateColumns: '160px 220px 1fr',
                gap: 20,
                padding: '13px 16px',
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                fontSize: 13,
                alignItems: 'baseline'
              }}
            >
              <span style={{ color: 'var(--text-faint)' }}>{r.cmd}</span>
              <span style={{ color: 'var(--amber)', fontWeight: 600 }}>{r.val}</span>
              <span style={{ color: 'var(--text-dim)' }}>{r.note}</span>
            </div>
          ))}
        </div>
      </section>

      <footer style={{ borderTop: '1px solid var(--border)', padding: '24px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 12 }}>
        nexus.hosting — bot.chnexus.net
      </footer>

      <style>{`
        @keyframes blink { 50% { opacity: 0; } }
        @media (max-width: 760px) {
          header.container { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
