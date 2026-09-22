import { useEffect, useState } from 'react';
import api from '../api/client';

export default function SftpPanel({ botId, sftpUsername, onCredentialsChanged }) {
  const [creds, setCreds] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    api.get(`/bots/${botId}/sftp-info`).then(({ data }) => setInfo(data)).catch(() => {});
  }, [botId]);

  async function generate() {
    if (sftpUsername && !confirm('This will invalidate the current SFTP password. Continue?')) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post(`/bots/${botId}/sftp-credentials`);
      setCreds(data);
      onCredentialsChanged?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate SFTP credentials.');
    } finally {
      setLoading(false);
    }
  }

  function copy(label, value) {
    navigator.clipboard?.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(''), 1500);
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 580 }}>
      <div className="app-eyebrow" style={{ marginBottom: 4 }}>SFTP access</div>
      <h3 style={{ fontSize: 15, marginBottom: 6 }}>Connect with WinSCP or any SFTP client</h3>
      <p style={{ color: 'var(--app-text-dim)', fontSize: 13, marginTop: 0, marginBottom: 14, lineHeight: 1.6 }}>
        Each bot gets its own SFTP login, scoped only to this bot's folder.
        The password is shown once when generated — store it somewhere safe.
      </p>
      <div className="app-alert app-alert-info">
        Use the host shown below, not this site's domain — SFTP traffic can't pass through
        the domain's HTTPS proxy.
      </div>

      {error && <div className="app-alert app-alert-error">{error}</div>}

      {creds ? (
        <div className="app-card" style={{ borderColor: 'var(--app-accent)', background: 'var(--app-accent-glow)', marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--app-accent)', fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            New credentials — copy the password now, it won't be shown again
          </div>
          <CredRow label="Host" value={creds.host} onCopy={copy} copied={copied} />
          <CredRow label="Port" value={creds.port} onCopy={copy} copied={copied} />
          <CredRow label="Username" value={creds.sftpUsername} onCopy={copy} copied={copied} />
          <CredRow label="Password" value={creds.sftpPassword} onCopy={copy} copied={copied} />
        </div>
      ) : sftpUsername ? (
        <div className="app-card" style={{ marginBottom: 16 }}>
          <CredRow label="Host" value={info?.host || 'loading…'} onCopy={copy} copied={copied} />
          <CredRow label="Port" value={info?.port || '2222'} onCopy={copy} copied={copied} />
          <CredRow label="Username" value={sftpUsername} onCopy={copy} copied={copied} />
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 8, fontSize: 13, padding: '4px 0' }}>
            <span style={{ color: 'var(--app-text-faint)' }}>Password</span>
            <span style={{ color: 'var(--app-text-faint)' }}>Hidden — regenerate to get a new one</span>
          </div>
        </div>
      ) : (
        <div style={{ color: 'var(--app-text-faint)', fontSize: 13, marginBottom: 16 }}>
          No SFTP credentials yet for this bot.
        </div>
      )}

      <button className="app-btn app-btn-primary app-btn-sm" onClick={generate} disabled={loading}>
        {loading ? 'Generating…' : sftpUsername ? 'Regenerate credentials' : 'Generate SFTP credentials'}
      </button>
    </div>
  );
}

function CredRow({ label, value, onCopy, copied }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr auto', gap: 8, alignItems: 'center', fontSize: 13, padding: '4px 0' }}>
      <span style={{ color: 'var(--app-text-faint)' }}>{label}</span>
      <code className="app-mono" style={{ color: 'var(--app-text)', wordBreak: 'break-all', fontFamily: 'var(--mono)' }}>{value}</code>
      <button className="app-btn app-btn-ghost app-btn-sm" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => onCopy(label, value)}>
        {copied === label ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
