const RUNTIME_TAG = { python: 'PY', node: 'JS' };

export default function RuntimeTag({ runtime, size = 34 }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: size >= 34 ? 8 : 6, fontSize: size >= 34 ? 11 : 9.5, fontWeight: 800,
      background: 'var(--app-surface-2)', color: 'var(--app-text-dim)', flexShrink: 0
    }}>
      {RUNTIME_TAG[runtime] || '?'}
    </span>
  );
}
