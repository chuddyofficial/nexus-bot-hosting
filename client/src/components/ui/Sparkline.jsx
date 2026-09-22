const MAX_POINTS = 60;

export default function Sparkline({ points, max, color, width = 480, height = 56 }) {
  if (points.length < 2) {
    return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} />;
  }
  const stepX = width / (MAX_POINTS - 1);
  const scaleY = (v) => height - (Math.min(v, max) / max) * height;
  const offset = MAX_POINTS - points.length;
  const path = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(offset + i) * stepX} ${scaleY(v)}`).join(' ');
  const area = `${path} L ${(offset + points.length - 1) * stepX} ${height} L ${offset * stepX} ${height} Z`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={area} fill={color} opacity="0.14" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

export { MAX_POINTS };
