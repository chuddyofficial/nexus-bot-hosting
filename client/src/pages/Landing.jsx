import { Link } from 'react-router-dom';
import Logo from '../components/Logo';

const FEATURES = [
  { title: 'Python & Node.js', desc: 'Host bots written in Python or JavaScript — pick a runtime and upload your code.' },
  { title: 'Isolated containers', desc: 'Every bot runs in its own sandboxed Docker container with dedicated CPU and memory limits.' },
  { title: 'In-browser editor', desc: 'Edit your files right in the dashboard with a full VS-Code-style editor. No SSH required.' },
  { title: 'Zip upload & extract', desc: 'Upload a .zip of your whole project and unzip it in place with one click.' },
  { title: 'Per-bot database', desc: 'Each bot gets its own isolated SQLite database file — no shared state between users.' },
  { title: '5 free bots', desc: 'Every account can host up to five bots at once, completely free.' }
];

export default function Landing() {
  return (
    <div>
      <nav className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px' }}>
        <Logo size={34} />
        <div style={{ display: 'flex', gap: 12 }}>
          <Link to="/login" className="btn btn-ghost">Log In</Link>
          <Link to="/signup" className="btn btn-primary">Get Started Free</Link>
        </div>
      </nav>

      <header className="container" style={{ textAlign: 'center', padding: '90px 24px 60px' }}>
        <div className="badge badge-created" style={{ marginBottom: 20 }}>
          <span className="dot" /> 100% Free Bot Hosting
        </div>
        <h1 style={{ fontSize: 52, lineHeight: 1.1, margin: '0 0 20px', fontWeight: 800, letterSpacing: -1 }}>
          Host your Python & JS bots<br />
          <span style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            in seconds, for free.
          </span>
        </h1>
        <p style={{ fontSize: 18, color: 'var(--text-dim)', maxWidth: 560, margin: '0 auto 32px' }}>
          Sign up, create a bot, upload your files, and go live. Nexus Bot Hosting gives every
          user five free, isolated bot servers with a full in-browser file editor.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
          <Link to="/signup" className="btn btn-primary" style={{ padding: '14px 28px', fontSize: 15 }}>
            Create Free Account
          </Link>
          <Link to="/login" className="btn btn-secondary" style={{ padding: '14px 28px', fontSize: 15 }}>
            Log In
          </Link>
        </div>
      </header>

      <section className="container" style={{ padding: '40px 24px 100px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
          {FEATURES.map((f) => (
            <div className="card" key={f.title}>
              <h3 style={{ margin: '0 0 8px', fontSize: 17 }}>{f.title}</h3>
              <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer style={{ borderTop: '1px solid var(--border)', padding: '28px 24px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
        Nexus Bot Hosting &middot; bot.chnexus.net
      </footer>
    </div>
  );
}
