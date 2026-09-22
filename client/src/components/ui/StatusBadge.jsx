export default function StatusBadge({ status, style }) {
  return (
    <span className={`app-badge app-badge-${status}`} style={style}>
      <span className="app-dot" />{status}
    </span>
  );
}
