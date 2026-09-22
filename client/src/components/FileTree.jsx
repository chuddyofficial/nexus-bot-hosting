import { useState } from 'react';

function tagFor(name, type) {
  if (type === 'dir') return null;
  if (name.endsWith('.zip')) return 'ZIP';
  if (name.endsWith('.py')) return 'PY';
  if (name.endsWith('.js') || name.endsWith('.mjs')) return 'JS';
  if (name.endsWith('.json')) return 'JSON';
  if (name.endsWith('.env')) return 'ENV';
  if (name.endsWith('.md')) return 'MD';
  return null;
}

export default function FileTree({ nodes, activePath, onOpenFile, onAction, depth = 0 }) {
  return (
    <div>
      {nodes.map((node) => (
        <TreeNode key={node.path} node={node} activePath={activePath} onOpenFile={onOpenFile} onAction={onAction} depth={depth} />
      ))}
    </div>
  );
}

function TreeNode({ node, activePath, onOpenFile, onAction, depth }) {
  const [open, setOpen] = useState(true);
  const isActive = node.path === activePath;
  const tag = tagFor(node.name, node.type);

  return (
    <div>
      <div
        onClick={() => (node.type === 'dir' ? setOpen(!open) : onOpenFile(node))}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '5px 8px', paddingLeft: 8 + depth * 14,
          borderRadius: 2, cursor: 'pointer', fontSize: 13,
          background: isActive ? 'var(--app-accent-glow)' : 'transparent',
          color: isActive ? 'var(--app-accent)' : 'var(--app-text-dim)'
        }}
        onContextMenu={(e) => { e.preventDefault(); onAction('menu', node, { x: e.clientX, y: e.clientY }); }}
      >
        {node.type === 'dir' ? (
          <span style={{ width: 10, fontSize: 10, color: 'var(--app-text-faint)' }}>{open ? '▾' : '▸'}</span>
        ) : (
          <span style={{
            width: 26, fontSize: 9, fontWeight: 800, textAlign: 'center',
            color: 'var(--app-text-faint)', letterSpacing: '0.02em'
          }}>
            {tag || '·'}
          </span>
        )}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
        {node.type === 'file' && node.name.endsWith('.zip') && (
          <button
            className="app-btn app-btn-ghost app-btn-sm"
            style={{ padding: '2px 8px', fontSize: 11 }}
            onClick={(e) => { e.stopPropagation(); onAction('extract', node); }}
          >
            Unzip
          </button>
        )}
        <button
          className="app-btn app-btn-ghost app-btn-sm"
          style={{ padding: '2px 6px', fontSize: 11 }}
          onClick={(e) => { e.stopPropagation(); onAction('delete', node); }}
        >
          &times;
        </button>
      </div>
      {node.type === 'dir' && open && node.children?.length > 0 && (
        <FileTree nodes={node.children} activePath={activePath} onOpenFile={onOpenFile} onAction={onAction} depth={depth + 1} />
      )}
    </div>
  );
}
