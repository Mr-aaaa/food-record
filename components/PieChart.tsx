interface PieSlice {
  label: string;
  value: number;
  color: string;
}

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

export default function PieChart({ slices, size = 120, thickness = 0.62 }: Readonly<{ slices: readonly PieSlice[]; size?: number; thickness?: number }>) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 1;
  const ir = r * thickness;
  let angle = -Math.PI / 2;
  const gap = slices.length > 1 ? 0.015 : 0;

  const paths = slices.map((slice) => {
    const sweep = (slice.value / total) * Math.PI * 2;
    const a0 = angle + gap;
    const a1 = angle + sweep - gap;
    angle += sweep;
    if (a1 <= a0) return null;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p0 = polarToCartesian(cx, cy, r, a0);
    const p1 = polarToCartesian(cx, cy, r, a1);
    const p2 = polarToCartesian(cx, cy, ir, a1);
    const p3 = polarToCartesian(cx, cy, ir, a0);
    return { d: `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${ir} ${ir} 0 ${large} 0 ${p3.x} ${p3.y} Z`, color: slice.color, label: slice.label, pct: Math.round((slice.value / total) * 100) };
  }).filter(Boolean);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={slices.map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(`、`)}>
      {paths.map((p, i) => (
        <path key={i} d={p!.d} fill={p!.color} stroke="var(--surface)" strokeWidth={1.2} />
      ))}
    </svg>
  );
}
