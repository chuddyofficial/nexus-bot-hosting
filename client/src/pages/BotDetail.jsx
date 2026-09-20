import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import AppNav from '../components/AppNav';
import FileTree from '../components/FileTree';
import api from '../api/client';

const STATUS_LABEL = { running: 'Running', stopped: 'Stopped', created: 'Created', error: 'Error' };

function langForFile(name = '') {
  if (name.endsWith('.py')) return 'python';
  if (name.endsWith('.js') || name.endsWith('.mjs')) return 'javascript';
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.md')) return 'markdown';
  if (name.endsWith('.html')) return 'html';
  if (name.endsWith('.css')) return 'css';
  return 'plaintext';
}

export default function BotDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bot, setBot] = useState(null);
  const [tree, setTree] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [logs, setLogs] = useState('');
  const [tab, setTab] = useState('editor');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  const loadBot = useCallback(async () => {
    const { data } = await api.get(`/bots/${id}`);
    setBot(data.bot);
  }, [id]);

  const loadTree = useCallback(async () => {
    const { data } = await api.get(`/bots/${id}/tree`);
    setTree(data.tree);
  }, [id]);

  useEffect(() => { loadBot(); loadTree(); }, [loadBot, loadTree]);

  useEffect(() => {
    if (tab !== 'console' || !bot) return;
    const load = () => api.get(`/bots/${id}/logs`).then(({ data }) => setLogs(data.logs));
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [tab, bot, id]);

  async function openFile(node) {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    try {
      const { data } = await api.get(`/bots/${id}/file`, { params: { path: node.path } });
      setActiveFile(node.path);
      setContent(data.content);
      setDirty(false);
      setTab('editor');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not open file.');
    }
  }

  async function saveFile() {
    if (!activeFile) return;
    setBusy(true);
    try {
      await api.put(`/bots/${id}/file`, { path: activeFile, content });
      setDirty(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save file.');
    } finally {
      setBusy(false);
    }
  }

  async function handleTreeAction(action, node) {
    setError('');
    try {
      if (action === 'delete') {
        if (!confirm(`Delete "${node.name}"?`)) return;
        await api.delete(`/bots/${id}/file`, { data: { path: node.path } });
        if (activeFile === node.path) { setActiveFile(null); setContent(''); }
        await loadTree();
      } else if (action === 'extract') {
        await api.post(`/bots/${id}/extract`, { path: node.path });
        await loadTree();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    }
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    formData.append('path', '');
    setBusy(true);
    setError('');
    try {
      await api.post(`/bots/${id}/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      await loadTree();
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed.');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  async function handleNewFile() {
    const name = prompt('New file name (e.g. utils.py):');
    if (!name) return;
    try {
      await api.post(`/bots/${id}/create`, { path: name, type: 'file' });
      await loadTree();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create file.');
    }
  }

  async function toggleRunning() {
    setBusy(true);
    setError('');
    try {
      if (bot.status === 'running') {
        await api.post(`/bots/${id}/stop`);
      } else {
        await api.post(`/bots/${id}/start`);
        setTab('console');
      }
      await loadBot();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteBot() {
    if (!confirm(`Permanently delete "${bot.name}"? This cannot be undone.`)) return;
    await api.delete(`/bots/${id}`);
    navigate('/dashboard');
  }

  async function setAsEntry() {
    if (!activeFile) return;
    try {
      await api.put(`/bots/${id}/entry-file`, { entryFile: activeFile.split('/').pop() });
      await loadBot();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to set entry file.');
    }
  }

  if (!bot) return <div><AppNav /><div className="container" style={{ padding: 32 }}>Loading…</div></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppNav />
      <div style={{ borderBottom: '1px solid var(--border)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/dashboard" style={{ color: 'var(--text-faint)', fontSize: 13 }}>← Back</Link>
          <h2 style={{ margin: 0 }}>{bot.name}</h2>
          <span className={`badge badge-${bot.status}`}><span className="dot" />{STATUS_LABEL[bot.status] || bot.status}</span>
          <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>{bot.runtime === 'python' ? '🐍 Python' : '⬢ Node.js'}</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setTab(tab === 'console' ? 'editor' : 'console')}>
            {tab === 'console' ? 'Editor' : 'Console'}
          </button>
          <button className={`btn btn-sm ${bot.status === 'running' ? 'btn-danger' : 'btn-primary'}`} onClick={toggleRunning} disabled={busy}>
            {bot.status === 'running' ? 'Stop' : 'Start'}
          </button>
          <button className="btn btn-danger btn-sm" onClick={deleteBot}>Delete</button>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ margin: '12px 24px 0' }}>{error}</div>}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: 260, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 12, display: 'flex', gap: 8, borderBottom: '1px solid var(--border)' }}>
            <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => fileInputRef.current.click()}>Upload</button>
            <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={handleNewFile}>+ File</button>
            <input ref={fileInputRef} type="file" multiple hidden onChange={handleUpload} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            <FileTree nodes={tree} activePath={activeFile} onOpenFile={openFile} onAction={handleTreeAction} />
          </div>
          <div style={{ padding: 10, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-faint)' }}>
            Entry file: <strong style={{ color: 'var(--text-dim)' }}>{bot.entryFile || 'none'}</strong>
            {activeFile && activeFile.split('/').pop() !== bot.entryFile && (
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6, padding: '1px 6px' }} onClick={setAsEntry}>Set as entry</button>
            )}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {tab === 'console' ? (
            <div style={{ flex: 1, background: '#05070c', color: '#9BF0A0', fontFamily: 'monospace', fontSize: 13, padding: 16, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
              {logs || 'No logs yet. Start your bot to see output here.'}
            </div>
          ) : activeFile ? (
            <>
              <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{activeFile}{dirty && ' •'}</span>
                <button className="btn btn-primary btn-sm" onClick={saveFile} disabled={!dirty || busy}>Save</button>
              </div>
              <div style={{ flex: 1 }}>
                <Editor
                  height="100%"
                  theme="vs-dark"
                  language={langForFile(activeFile)}
                  value={content}
                  onChange={(v) => { setContent(v ?? ''); setDirty(true); }}
                  options={{ fontSize: 13, minimap: { enabled: false }, automaticLayout: true }}
                />
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)' }}>
              Select a file to edit, or upload your bot files.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
