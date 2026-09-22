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
import BotOverviewPanel from '../components/BotOverviewPanel';
import RuntimeTag from '../components/ui/RuntimeTag';
import StatusBadge from '../components/ui/StatusBadge';
import ConfirmModal from '../components/ui/ConfirmModal';
import Modal from '../components/ui/Modal';
import Skeleton, { SkeletonCard } from '../components/ui/Skeleton';
import api from '../api/client';
import { useBots } from '../context/BotsContext';
import { useToast } from '../context/ToastContext';

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

export default function BotDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'overview';
  const navigate = useNavigate();
  const { refresh: refreshBotList } = useBots();
  const toast = useToast();
  const [bot, setBot] = useState(null);
  const [tree, setTree] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [confirmDeleteFile, setConfirmDeleteFile] = useState(null);
  const [confirmDeleteBot, setConfirmDeleteBot] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(null);
  const [newFileModal, setNewFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState('');
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

  async function doOpenFile(node) {
    try {
      const { data } = await api.get(`/bots/${id}/file`, { params: { path: node.path } });
      setActiveFile(node.path);
      setContent(data.content);
      setDirty(false);
      navigate(`/bots/${id}?tab=editor`);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not open file.');
    }
  }

  async function openFile(node) {
    if (dirty) { setConfirmDiscard(node); return; }
    await doOpenFile(node);
  }

  async function saveFile() {
    if (!activeFile) return;
    setBusy(true);
    try {
      await api.put(`/bots/${id}/file`, { path: activeFile, content });
      setDirty(false);
      toast.success('File saved.');
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
        setConfirmDeleteFile(node);
      } else if (action === 'extract') {
        await api.post(`/bots/${id}/extract`, { path: node.path });
        await loadTree();
        toast.success(`Extracted ${node.name}.`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    }
  }

  async function confirmDeleteFileNow() {
    const node = confirmDeleteFile;
    if (!node) return;
    setBusy(true);
    try {
      await api.delete(`/bots/${id}/file`, { data: { path: node.path } });
      if (activeFile === node.path) { setActiveFile(null); setContent(''); }
      await loadTree();
      toast.success(`Deleted ${node.name}.`);
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    } finally {
      setBusy(false);
      setConfirmDeleteFile(null);
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
      toast.success(`Uploaded ${entries.length} file${entries.length === 1 ? '' : 's'}.`);
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

  function handleNewFile() {
    setNewFileName('');
    setNewFileModal(true);
  }

  async function submitNewFile(e) {
    e?.preventDefault();
    const name = newFileName.trim();
    if (!name) return;
    try {
      await api.post(`/bots/${id}/create`, { path: name, type: 'file' });
      await loadTree();
      setNewFileModal(false);
      toast.success(`Created ${name}.`);
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
        toast.success(`${bot.name} stopped.`);
      } else {
        await api.post(`/bots/${id}/start`);
        toast.success(`${bot.name} started.`);
        navigate(`/bots/${id}?tab=console`);
      }
      await loadBot();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteBotNow() {
    setBusy(true);
    try {
      await api.delete(`/bots/${id}`);
      await refreshBotList();
      toast.success(`${bot.name} deleted.`);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete bot.');
      setBusy(false);
      setConfirmDeleteBot(false);
    }
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
        <div style={{ padding: '24px 28px', maxWidth: 720 }}>
          <Skeleton width={180} height={20} style={{ marginBottom: 20 }} />
          <SkeletonCard />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <div style={{ borderBottom: '1px solid var(--app-border)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <RuntimeTag runtime={bot.runtime} size={30} />
            <h2 style={{ fontSize: 17 }}>{bot.name}</h2>
            <StatusBadge status={bot.status} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className={`app-btn app-btn-sm ${bot.status === 'running' ? 'app-btn-danger' : 'app-btn-primary'}`} onClick={toggleRunning} disabled={busy}>
              {bot.status === 'running' ? 'Stop' : 'Start'}
            </button>
            <button className="app-btn app-btn-danger app-btn-sm" onClick={() => setConfirmDeleteBot(true)}>Delete</button>
          </div>
        </div>

        {error && <div className="app-alert app-alert-error" style={{ margin: '12px 24px 0' }}>{error}</div>}

        <div className="app-bot-body" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {tab === 'editor' && (
            <div
              className="app-bot-filetree"
              style={{
                width: 260, flexShrink: 0, borderRight: '1px solid var(--app-border)', display: 'flex', flexDirection: 'column',
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

          <div className="app-bot-editor-area" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            {tab === 'overview' ? (
              <BotOverviewPanel bot={bot} botId={id} />
            ) : tab === 'console' ? (
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

      {confirmDeleteFile && (
        <ConfirmModal
          title={`Delete "${confirmDeleteFile.name}"?`}
          message={confirmDeleteFile.type === 'dir'
            ? 'This will permanently delete the folder and everything inside it.'
            : 'This will permanently delete the file.'}
          confirmLabel="Delete"
          busy={busy}
          onConfirm={confirmDeleteFileNow}
          onCancel={() => setConfirmDeleteFile(null)}
        />
      )}

      {confirmDeleteBot && (
        <ConfirmModal
          title={`Delete "${bot.name}"?`}
          message="This permanently deletes the bot, its container, and all its files. This cannot be undone."
          confirmLabel="Delete bot"
          busy={busy}
          onConfirm={confirmDeleteBotNow}
          onCancel={() => setConfirmDeleteBot(false)}
        />
      )}

      {confirmDiscard && (
        <ConfirmModal
          title="Discard unsaved changes?"
          message={`"${activeFile}" has unsaved edits that will be lost.`}
          confirmLabel="Discard"
          onConfirm={async () => { const node = confirmDiscard; setConfirmDiscard(null); await doOpenFile(node); }}
          onCancel={() => setConfirmDiscard(null)}
        />
      )}

      {newFileModal && (
        <Modal onClose={() => setNewFileModal(false)} maxWidth={380}>
          <form onSubmit={submitNewFile}>
            <h2 style={{ fontSize: 16, marginBottom: 16 }}>New file</h2>
            <div className="app-field">
              <label className="app-field-label">File name</label>
              <input
                className="app-input" autoFocus value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="utils.py"
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <button type="button" className="app-btn app-btn-ghost" onClick={() => setNewFileModal(false)}>Cancel</button>
              <button type="submit" className="app-btn app-btn-primary" disabled={!newFileName.trim()}>Create</button>
            </div>
          </form>
        </Modal>
      )}
    </AppShell>
  );
}
