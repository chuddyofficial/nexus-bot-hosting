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
    <div style={{ padding: 20, maxWidth: 560 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>sftp access</div>
      <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>connect with WinSCP / any SFTP client</h3>
      <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 0, marginBottom: 12, lineHeight: 1.6 }}>
        Each bot gets its own SFTP login, scoped only to this bot's folder.
        The password is shown once when generated — store it somewhere safe.
      </p>
      <div className="alert alert-info" style={{ marginBottom: 20 }}>
        use the host shown below, not this site's domain — SFTP traffic can't pass through
        the domain's HTTPS proxy
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {creds ? (
        <div style={{ border: '1px solid var(--amber-dim)', background: 'var(--amber-glow)', borderRadius: 3, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            new credentials — copy the password now, it won't be shown again
          </div>
          <CredRow label="host" value={creds.host} onCopy={copy} copied={copied} />
          <CredRow label="port" value={creds.port} onCopy={copy} copied={copied} />
          <CredRow label="username" value={creds.sftpUsername} onCopy={copy} copied={copied} />
          <CredRow label="password" value={creds.sftpPassword} onCopy={copy} copied={copied} />
        </div>
      ) : sftpUsername ? (
        <div style={{ border: '1px solid var(--border)', borderRadius: 3, padding: 16, marginBottom: 16 }}>
          <CredRow label="host" value={info?.host || 'loading…'} onCopy={copy} copied={copied} />
          <CredRow label="port" value={info?.port || '2222'} onCopy={copy} copied={copied} />
          <CredRow label="username" value={sftpUsername} onCopy={copy} copied={copied} />
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8, fontSize: 13, padding: '4px 0' }}>
            <span style={{ color: 'var(--text-faint)' }}>password</span>
            <span style={{ color: 'var(--text-faint)' }}>hidden — regenerate to get a new one</span>
          </div>
        </div>
      ) : (
        <div style={{ color: 'var(--text-faint)', fontSize: 13, marginBottom: 16 }}>
          No SFTP credentials yet for this bot.
        </div>
      )}

      <button className="btn btn-primary btn-sm" onClick={generate} disabled={loading}>
        {loading ? 'generating…' : sftpUsername ? 'regenerate credentials' : 'generate sftp credentials'}
      </button>
    </div>
  );
}

function CredRow({ label, value, onCopy, copied }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 8, alignItems: 'center', fontSize: 13, padding: '4px 0' }}>
      <span style={{ color: 'var(--text-faint)' }}>{label}</span>
      <code className="mono" style={{ color: 'var(--text)', wordBreak: 'break-all' }}>{value}</code>
      <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => onCopy(label, value)}>
        {copied === label ? 'copied' : 'copy'}
      </button>
    </div>
  );
}
