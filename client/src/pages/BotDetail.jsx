import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import AppShell from '../components/AppShell';
import FileTree from '../components/FileTree';
import SftpPanel from '../components/SftpPanel';
import LiveConsole from '../components/LiveConsole';
import BotSettingsPanel from '../components/BotSettingsPanel';
import StartupConfigPanel from '../components/StartupConfigPanel';
import MetricsPanel from '../components/MetricsPanel';
import api from '../api/client';
import { useBots } from '../context/BotsContext';

// Walks a dropped FileSystemEntry (file or directory) recursively, collecting
// { file, relativePath } pairs so folder structure survives the upload.
function readEntry(entry, basePath = '') {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((file) => resolve([{ file, relativePath: basePath + entry.name }]));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const all = [];
      const readBatch = () => {
        reader.readEntries(async (entries) => {
          if (entries.length === 0) {
            const results = await Promise.all(all);
            resolve(results.flat());
            return;
          }
          for (const child of entries) {
            all.push(readEntry(child, basePath + entry.name + '/'));
          }
          readBatch();
        });
      };
      readBatch();
    } else {
      resolve([]);
    }
  });
}

async function collectDroppedFiles(dataTransfer) {
  const items = Array.from(dataTransfer.items || []);
  const entries = items.map((item) => item.webkitGetAsEntry?.()).filter(Boolean);

  if (entries.length === 0) {
    return Array.from(dataTransfer.files || []).map((file) => ({ file, relativePath: file.name }));
  }

  const results = await Promise.all(entries.map((entry) => readEntry(entry)));
  return results.flat();
}

function langForFile(name = '') {
  if (name.endsWith('.py')) return 'python';
  if (name.endsWith('.js') || name.endsWith('.mjs')) return 'javascript';
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.md')) return 'markdown';
  if (name.endsWith('.html')) return 'html';
  if (name.endsWith('.css')) return 'css';
  return 'plaintext';
}

const RUNTIME_TAG = { python: 'PY', node: 'JS' };

export default function BotDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'editor';
  const navigate = useNavigate();
  const { refresh: refreshBotList } = useBots();
  const [bot, setBot] = useState(null);
  const [tree, setTree] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const loadBot = useCallback(async () => {
    const { data } = await api.get(`/bots/${id}`);
    setBot(data.bot);
  }, [id]);

  const loadTree = useCallback(async () => {
    const { data } = await api.get(`/bots/${id}/tree`);
    setTree(data.tree);
  }, [id]);

  useEffect(() => { setBot(null); loadBot(); loadTree(); }, [loadBot, loadTree]);

  async function openFile(node) {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    try {
      const { data } = await api.get(`/bots/${id}/file`, { params: { path: node.path } });
      setActiveFile(node.path);
      setContent(data.content);
      setDirty(false);
      navigate(`/bots/${id}`);
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

  async function uploadEntries(entries) {
    if (entries.length === 0) return;
    const formData = new FormData();
    entries.forEach(({ file }) => formData.append('files', file));
    formData.append('path', '');
    formData.append('relativePaths', JSON.stringify(entries.map((e) => e.relativePath)));
    setBusy(true);
    setError('');
    try {
      await api.post(`/bots/${id}/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      await loadTree();
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files || []);
    await uploadEntries(files.map((file) => ({ file, relativePath: file.webkitRelativePath || file.name })));
    e.target.value = '';
  }

  async function handleDrop(e) {
    e.preventDefault();
    setDragActive(false);
    const entries = await collectDroppedFiles(e.dataTransfer);
    await uploadEntries(entries);
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
        navigate(`/bots/${id}?tab=console`);
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
    await refreshBotList();
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

  if (!bot) {
    return (
      <AppShell>
        <div style={{ padding: 40, color: 'var(--app-text-dim)' }}>Loading…</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <div style={{ borderBottom: '1px solid var(--app-border)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 8, fontSize: 10, fontWeight: 800,
              background: 'var(--app-surface-2)', color: 'var(--app-text-dim)'
            }}>
              {RUNTIME_TAG[bot.runtime]}
            </span>
            <h2 style={{ fontSize: 17 }}>{bot.name}</h2>
            <span className={`app-badge app-badge-${bot.status}`}><span className="app-dot" />{bot.status}</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className={`app-btn app-btn-sm ${bot.status === 'running' ? 'app-btn-danger' : 'app-btn-primary'}`} onClick={toggleRunning} disabled={busy}>
              {bot.status === 'running' ? 'Stop' : 'Start'}
            </button>
            <button className="app-btn app-btn-danger app-btn-sm" onClick={deleteBot}>Delete</button>
          </div>
        </div>

        {error && <div className="app-alert app-alert-error" style={{ margin: '12px 24px 0' }}>{error}</div>}

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {tab === 'editor' && (
            <div
              style={{
                width: 260, borderRight: '1px solid var(--app-border)', display: 'flex', flexDirection: 'column',
                position: 'relative', background: dragActive ? 'var(--app-accent-glow)' : 'transparent',
                transition: 'background 0.1s ease'
              }}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setDragActive(false); }}
              onDrop={handleDrop}
            >
              {dragActive && (
                <div style={{
                  position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none',
                  border: '2px dashed var(--app-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(110,118,255,0.08)', fontSize: 13, color: 'var(--app-accent)', fontWeight: 600, textAlign: 'center', padding: 16
                }}>
                  Drop files or folders to upload
                </div>
              )}
              <div style={{ padding: 12, display: 'flex', gap: 8, borderBottom: '1px solid var(--app-border)' }}>
                <button className="app-btn app-btn-secondary app-btn-sm" style={{ flex: 1 }} onClick={() => fileInputRef.current.click()}>Upload</button>
                <button className="app-btn app-btn-secondary app-btn-sm" style={{ flex: 1 }} onClick={handleNewFile}>+ File</button>
                <input ref={fileInputRef} type="file" multiple hidden onChange={handleUpload} />
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                <FileTree nodes={tree} activePath={activeFile} onOpenFile={openFile} onAction={handleTreeAction} />
              </div>
              <div style={{ padding: 10, borderTop: '1px solid var(--app-border)', fontSize: 12, color: 'var(--app-text-faint)' }}>
                Entry: <strong style={{ color: 'var(--app-accent)' }}>{bot.entryFile || 'none'}</strong>
                {activeFile && activeFile.split('/').pop() !== bot.entryFile && (
                  <button className="app-btn app-btn-ghost app-btn-sm" style={{ marginLeft: 6, padding: '1px 6px' }} onClick={setAsEntry}>Set as entry</button>
                )}
              </div>
            </div>
          )}

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            {tab === 'console' ? (
              <LiveConsole botId={id} active={tab === 'console'} />
            ) : tab === 'metrics' ? (
              <MetricsPanel botId={id} running={bot.status === 'running'} />
            ) : tab === 'startup' ? (
              <StartupConfigPanel bot={bot} onUpdated={loadBot} />
            ) : tab === 'settings' ? (
              <BotSettingsPanel bot={bot} onUpdated={async () => { await loadBot(); await refreshBotList(); }} />
            ) : tab === 'sftp' ? (
              <SftpPanel botId={id} sftpUsername={bot.sftpUsername} onCredentialsChanged={loadBot} />
            ) : activeFile ? (
              <>
                <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--app-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--app-text-dim)' }}>{activeFile}{dirty && <span style={{ color: 'var(--app-accent)' }}> &bull; unsaved</span>}</span>
                  <button className="app-btn app-btn-primary app-btn-sm" onClick={saveFile} disabled={!dirty || busy}>Save</button>
                </div>
                <div style={{ flex: 1 }}>
                  <Editor
                    height="100%"
                    theme="vs-dark"
                    language={langForFile(activeFile)}
                    value={content}
                    onChange={(v) => { setContent(v ?? ''); setDirty(true); }}
                    options={{ fontSize: 13, minimap: { enabled: false }, automaticLayout: true, fontFamily: 'JetBrains Mono, monospace' }}
                  />
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--app-text-faint)', fontSize: 13 }}>
                Select a file to edit, or upload your bot files
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
