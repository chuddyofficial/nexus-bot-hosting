// The app's own mark: a node/host glyph (three points bridged by a connector,
// reading as both an "N" and a small hosting network) distinct from the
// landing page's terminal ">_" prompt mark.
export default function AppLogo({ size = 28, withWordmark = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="7" fill="#1C1F26" />
        <circle cx="9" cy="9" r="3" fill="#6E76FF" />
        <circle cx="23" cy="9" r="3" fill="#6E76FF" fillOpacity="0.4" />
        <circle cx="9" cy="23" r="3" fill="#6E76FF" fillOpacity="0.4" />
        <circle cx="23" cy="23" r="3" fill="#6E76FF" />
        <path d="M9 12v8M23 12v8M12 9h8M12 23h8" stroke="#3A3F4C" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M9 9L23 23" stroke="#6E76FF" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      {withWordmark && (
        <span style={{ fontWeight: 700, fontSize: size * 0.52, letterSpacing: '-0.02em', color: 'var(--app-text)', fontFamily: 'var(--sans)' }}>
          Nexus
        </span>
      )}
    </div>
  );
}
