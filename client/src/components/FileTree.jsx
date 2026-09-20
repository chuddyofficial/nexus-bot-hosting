import { useState } from 'react';

function iconFor(name, type) {
  if (type === 'dir') return '📁';
  if (name.endsWith('.zip')) return '🗜️';
  if (name.endsWith('.py')) return '🐍';
  if (name.endsWith('.js') || name.endsWith('.mjs')) return '📜';
  if (name.endsWith('.json')) return '🧾';
  if (name.endsWith('.env')) return '🔒';
  return '📄';
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

  return (
    <div>
      <div
        onClick={() => (node.type === 'dir' ? setOpen(!open) : onOpenFile(node))}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 8px', paddingLeft: 8 + depth * 14,
          borderRadius: 6, cursor: 'pointer', fontSize: 13,
          background: isActive ? 'rgba(108,92,231,0.15)' : 'transparent',
          color: isActive ? 'var(--text)' : 'var(--text-dim)'
        }}
        onContextMenu={(e) => { e.preventDefault(); onAction('menu', node, { x: e.clientX, y: e.clientY }); }}
      >
        {node.type === 'dir' && <span style={{ width: 10, fontSize: 10 }}>{open ? '▾' : '▸'}</span>}
        <span>{iconFor(node.name, node.type)}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
        {node.type === 'file' && node.name.endsWith('.zip') && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ padding: '2px 8px', fontSize: 11 }}
            onClick={(e) => { e.stopPropagation(); onAction('extract', node); }}
          >
            Unzip
          </button>
        )}
        <button
          className="btn btn-ghost btn-sm"
          style={{ padding: '2px 6px', fontSize: 11 }}
          onClick={(e) => { e.stopPropagation(); onAction('delete', node); }}
        >
          ✕
        </button>
      </div>
      {node.type === 'dir' && open && node.children?.length > 0 && (
        <FileTree nodes={node.children} activePath={activePath} onOpenFile={onOpenFile} onAction={onAction} depth={depth + 1} />
      )}
    </div>
  );
}
