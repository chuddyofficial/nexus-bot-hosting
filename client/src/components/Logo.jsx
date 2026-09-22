export default function Logo({ size = 32, withWordmark = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
        <rect x="1" y="1" width="62" height="62" rx="3" fill="#0a0a0a" stroke="#45402e" strokeWidth="1.5" />
        <text x="10" y="41" fontFamily="'JetBrains Mono', monospace" fontSize="26" fontWeight="700" fill="#ffb000">
          &gt;_
        </text>
      </svg>
      {withWordmark && (
        <span style={{ fontWeight: 700, fontSize: size * 0.5, letterSpacing: '-0.01em', color: 'var(--text)', fontFamily: 'var(--mono)' }}>
          nexus<span style={{ color: 'var(--amber)' }}>.hosting</span>
        </span>
      )}
    </div>
  );
}
