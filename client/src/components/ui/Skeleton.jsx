export default function Skeleton({ width = '100%', height = 14, radius = 6, style }) {
  return <div className="app-skeleton" style={{ width, height, borderRadius: radius, ...style }} />;
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="app-card">
      <Skeleton width="40%" height={12} style={{ marginBottom: 14 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={11} style={{ marginBottom: i === lines - 1 ? 0 : 8 }} />
      ))}
    </div>
  );
}
