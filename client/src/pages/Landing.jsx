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

const FEATURES = [
  { tag: '01', title: 'Isolated containers', desc: 'Every bot gets its own Docker container — its own filesystem, process tree, and resource caps. Nothing shared with other users.' },
  { tag: '02', title: 'In-browser editor', desc: 'Full Monaco (the VS Code editor) right in the dashboard. Syntax highlighting, no local setup, no SSH required.' },
  { tag: '03', title: 'Live streaming console', desc: 'Real-time log output over WebSocket the moment your bot starts — not a refresh-to-poll log viewer.' },
  { tag: '04', title: 'Drag-and-drop deploy', desc: 'Drop files or whole folders onto the dashboard, or upload a .zip and extract it in place.' },
  { tag: '05', title: 'SFTP access', desc: 'Prefer WinSCP or FileZilla? Every bot gets its own chrooted SFTP login, scoped to just that bot\'s folder.' },
  { tag: '06', title: 'Resource metrics', desc: 'Live CPU and memory graphs per bot, polled straight from the container runtime — know what your bot is actually using.' },
  { tag: '07', title: 'Configurable startup', desc: 'Custom start commands, pre-start hooks (pip install, npm install), and restart policies — never / on-crash / always.' },
  { tag: '08', title: 'Per-bot database', desc: "Each bot's SQLite file lives in its own folder. No shared tables, no cross-bot data ever." }
];

const STEPS = [
  { n: '1', title: 'Create an account', desc: 'Sign up with an email and password. No card, no trial clock — five bot slots from the start.' },
  { n: '2', title: 'Pick a runtime & upload', desc: 'Choose Python or Node.js, then drag your code in, upload a .zip, or connect over SFTP.' },
  { n: '3', title: 'Start your bot', desc: 'Hit start. Your bot boots in its own container and you watch it live in the streaming console.' }
];

function useMedia(query) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export default function Landing() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMobile = useMedia('(max-width: 760px)');

  useEffect(() => {
    if (visibleLines >= BOOT_LINES.length) return;
    const t = setTimeout(() => setVisibleLines((v) => v + 1), visibleLines === 0 ? 200 : 180);
    return () => clearTimeout(t);
  }, [visibleLines]);

  useEffect(() => { if (!isMobile) setDrawerOpen(false); }, [isMobile]);

  return (
    <div className="landing-scope" style={{ minHeight: '100%' }}>
      <nav className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
        <Logo size={32} />

        <div className="landing-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <a href="#features" className="prompt" style={{ fontSize: 13 }}>features</a>
          <a href="#how-it-works" className="prompt" style={{ fontSize: 13 }}>docs</a>
          <a href="#status" className="prompt" style={{ fontSize: 13 }}>status</a>
        </div>

        <div className="landing-nav-actions" style={{ display: 'flex', gap: 8 }}>
          <Link to="/login" className="btn btn-ghost btn-sm">log in</Link>
          <Link to="/signup" className="btn btn-primary btn-sm">create account</Link>
        </div>

        <button
          className="landing-nav-toggle btn btn-ghost btn-sm"
          aria-label="Toggle menu"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((v) => !v)}
          style={{ display: 'none' }}
        >
          {drawerOpen ? '✕' : '☰'}
        </button>

        {drawerOpen && (
          <div className="landing-nav-drawer">
            <a href="#features" className="prompt" onClick={() => setDrawerOpen(false)}>features</a>
            <a href="#how-it-works" className="prompt" onClick={() => setDrawerOpen(false)}>docs</a>
            <a href="#status" className="prompt" onClick={() => setDrawerOpen(false)}>status</a>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <Link to="/login" className="btn btn-ghost btn-sm" style={{ flex: 1 }}>log in</Link>
              <Link to="/signup" className="btn btn-primary btn-sm" style={{ flex: 1 }}>create account</Link>
            </div>
          </div>
        )}
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

      <section id="features" className="container" style={{ padding: '20px 24px 80px' }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>spec</div>
        <div style={{ border: '1px solid var(--border)', marginBottom: 56 }}>
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
              className="landing-spec-row"
            >
              <span style={{ color: 'var(--text-faint)' }}>{r.cmd}</span>
              <span style={{ color: 'var(--amber)', fontWeight: 600 }}>{r.val}</span>
              <span style={{ color: 'var(--text-dim)' }}>{r.note}</span>
            </div>
          ))}
        </div>

        <div className="eyebrow" style={{ marginBottom: 12 }}>features</div>
        <div className="landing-feature-grid">
          {FEATURES.map((f) => (
            <div key={f.tag} className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--amber-dim)', fontWeight: 700 }}>{f.tag}</span>
                <h3 style={{ fontSize: 14.5, margin: 0 }}>{f.title}</h3>
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: 0, lineHeight: 1.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="container" style={{ padding: '0 24px 80px' }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>how it works</div>
        <div className="landing-steps">
          {STEPS.map((s, i) => (
            <div key={s.n} style={{ display: 'flex', gap: 16 }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--border-bright)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                fontSize: 14, fontWeight: 700, color: 'var(--amber)'
              }}>
                {s.n}
              </div>
              <div>
                <h3 style={{ fontSize: 14.5, margin: '4px 0 6px' }}>{s.title}</h3>
                <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: 0, lineHeight: 1.7, maxWidth: 320 }}>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="container" style={{ padding: '0 24px 80px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 10 }}>security</div>
          <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>Isolated by default</h2>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 13, color: 'var(--text-dim)', lineHeight: 2 }}>
            <li>&gt; each bot runs in its own Docker container, capped on cpu/memory/pids</li>
            <li>&gt; filesystem access is bind-mounted only to that bot's own folder</li>
            <li>&gt; file manager and SFTP paths are guarded against traversal</li>
            <li>&gt; passwords hashed with bcrypt; sessions signed with JWT</li>
            <li>&gt; a runtime hiccup on one bot never touches another account</li>
          </ul>
        </div>

        <div className="card" style={{ borderColor: 'var(--amber-dim)' }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>pricing</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 34, fontWeight: 700, color: 'var(--amber)' }}>$0</span>
            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>/ forever</span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: '0 0 16px' }}>No card required. No trial clock.</p>
          <ul style={{ margin: '0 0 20px', padding: 0, listStyle: 'none', fontSize: 13, lineHeight: 2 }}>
            <li>&gt; 5 bot containers per account</li>
            <li>&gt; Python 3.12 and Node.js 20 runtimes</li>
            <li>&gt; in-browser editor + live console</li>
            <li>&gt; drag-and-drop upload + SFTP access</li>
          </ul>
          <Link to="/signup" className="btn btn-primary" style={{ width: '100%' }}>create free account &rarr;</Link>
        </div>
      </section>

      <section id="status" className="container" style={{ padding: '0 24px 80px' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="dot" style={{ color: 'var(--ok)' }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>All systems operational</span>
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>bot.chnexus.net — api, dashboard, sftp</span>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid var(--border)', padding: '24px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 12 }}>
        nexus.hosting — bot.chnexus.net
      </footer>

      <style>{`
        @keyframes blink { 50% { opacity: 0; } }
        .landing-feature-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        .landing-steps {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 32px;
        }
        .landing-nav-drawer { display: none; }
        @media (max-width: 900px) {
          .landing-feature-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 760px) {
          header.container { grid-template-columns: 1fr !important; }
          .landing-steps { grid-template-columns: 1fr; gap: 24px; }
          section.container[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
          .landing-spec-row {
            grid-template-columns: 1fr !important;
            gap: 4px !important;
          }
        }
        @media (max-width: 640px) {
          .landing-feature-grid { grid-template-columns: 1fr; }
          .landing-nav-links, .landing-nav-actions { display: none !important; }
          .landing-nav-toggle { display: inline-flex !important; }
          .landing-nav-drawer {
            display: flex;
            flex-direction: column;
            gap: 14px;
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: var(--surface);
            border-bottom: 1px solid var(--border);
            padding: 18px 24px 22px;
            z-index: 20;
          }
        }
      `}</style>
    </div>
  );
}
