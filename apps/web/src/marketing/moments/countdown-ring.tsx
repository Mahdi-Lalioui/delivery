// DESIGN §7.1-6: the time left to accept a new order. Informational only (DESIGN accessibility:
// restaurant countdowns never force anything). SVG attributes keep it CSP-safe.

const radius = 18;
const circumference = 2 * Math.PI * radius;

export function ringOffset(input: {
  remainingMs: number;
  totalMs: number;
  circumference: number;
}): number {
  if (input.totalMs <= 0) return input.circumference;
  const share = Math.min(1, Math.max(0, input.remainingMs / input.totalMs));
  return Math.round((1 - share) * input.circumference * 1000) / 1000;
}

export function CountdownRing(props: { remainingMs: number; totalMs: number; label: string }) {
  const offset = ringOffset({ ...props, circumference });
  return (
    <svg className="countdown-ring" viewBox="0 0 44 44" role="img" aria-label={props.label}>
      <circle className="countdown-ring-track" cx={22} cy={22} r={radius} />
      <circle
        className="countdown-ring-value"
        cx={22}
        cy={22}
        r={radius}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 22 22)"
      />
    </svg>
  );
}
