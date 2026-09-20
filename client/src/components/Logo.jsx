export default function Logo({ size = 32, withWordmark = true }) {
  return (
    <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
        <defs>
          <linearGradient id="logoGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#6C5CE7" />
            <stop offset="1" stopColor="#00D4FF" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="14" fill="#0B0E14" />
        <path d="M20 46V18h5.2l13.6 19.2V18H44v28h-5.2L25.2 26.8V46H20z" fill="url(#logoGrad)" />
        <circle cx="20" cy="18" r="3" fill="#00D4FF" />
        <circle cx="44" cy="46" r="3" fill="#6C5CE7" />
      </svg>
      {withWordmark && (
        <span style={{ fontWeight: 800, fontSize: size * 0.55, letterSpacing: 0.5, color: 'var(--text)' }}>
          NEXUS <span style={{ color: 'var(--accent)', fontWeight: 700 }}>BOT HOSTING</span>
        </span>
      )}
    </div>
  );
}
