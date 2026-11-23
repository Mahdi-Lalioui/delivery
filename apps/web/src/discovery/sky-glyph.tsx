import type { Moment } from "./time-of-day";

/** The light source of the night band (DESIGN §0): an eight-point zellige star for the sun, a crescent and stars at night. */
export function SkyGlyph({ moment }: { moment: Moment }) {
  const isNight = moment === "lil";
  return (
    <span className="discover-sky" aria-hidden="true">
      <svg viewBox="0 0 120 120" width="120" height="120">
        {isNight ? (
          <path className="discover-sky-body" d="M74 22a40 40 0 1 0 24 70A34 34 0 0 1 74 22Z" />
        ) : (
          <path
            className="discover-sky-body"
            d="M60 14 70 36 92 28 84 50 106 60 84 70 92 92 70 84 60 106 50 84 28 92 36 70 14 60 36 50 28 28 50 36Z"
          />
        )}
      </svg>
    </span>
  );
}
