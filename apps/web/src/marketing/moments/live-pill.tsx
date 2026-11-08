/** DESIGN §7.1-5: the harissa LIVE pill that pulses on tracking (static with reduced motion). */
export function LivePill({ label }: { label: string }) {
  return (
    <span className="live-pill">
      <span className="live-pill-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
