import "./state-art.css";

/**
 * Original line-and-fill illustrations for the customer app's empty and error states.
 * Every colour comes from DESIGN tokens through CSS classes, so light and dark both work;
 * they are decorative (aria-hidden) because the state's title carries the meaning.
 */
export type StateArtKind = "plate" | "search" | "error" | "bag";

function Plate() {
  return (
    <>
      <ellipse className="state-art-shadow" cx="60" cy="98" rx="38" ry="6" />
      <circle className="state-art-surface" cx="60" cy="62" r="34" />
      <circle className="state-art-line" cx="60" cy="62" r="24" />
      <path className="state-art-line" d="M14 40v20m-5-20v12a5 5 0 0 0 10 0V40M14 64v30" />
      <path className="state-art-line" d="M106 40c-6 4-6 18 0 22v32" />
      <path
        className="state-art-accent state-art-steam"
        d="M52 34c-4-6 4-8 0-14m10 14c-4-6 4-8 0-14"
      />
    </>
  );
}

function Search() {
  return (
    <>
      <ellipse className="state-art-shadow" cx="58" cy="100" rx="34" ry="5" />
      <path className="state-art-surface" d="M30 78h56a28 28 0 0 0-56 0Z" />
      <path className="state-art-line" d="M30 78a28 28 0 0 1 56 0" />
      <path className="state-art-line" d="M24 78h68M58 50v-6" />
      <circle className="state-art-glass" cx="76" cy="44" r="18" />
      <circle className="state-art-line" cx="76" cy="44" r="18" />
      <path className="state-art-accent" d="M89 57l14 14" />
    </>
  );
}

function SpilledBowl() {
  return (
    <>
      <ellipse className="state-art-shadow" cx="60" cy="100" rx="42" ry="6" />
      <path className="state-art-surface" d="M22 70a30 30 0 0 0 52 20L40 46a30 30 0 0 0-18 24Z" />
      <path className="state-art-line" d="M22 70a30 30 0 0 0 52 20L40 46a30 30 0 0 0-18 24Z" />
      <circle className="state-art-accent-fill" cx="84" cy="94" r="4" />
      <circle className="state-art-accent-fill" cx="96" cy="88" r="3" />
      <circle className="state-art-accent-fill" cx="104" cy="96" r="2.5" />
      <path className="state-art-line" d="M78 36l8 8m0-8-8 8" />
    </>
  );
}

function Bag() {
  return (
    <>
      <ellipse className="state-art-shadow" cx="60" cy="102" rx="34" ry="5" />
      <path className="state-art-surface" d="M30 44h60l-5 52H35Z" />
      <path className="state-art-line" d="M30 44h60l-5 52H35ZM46 44v-6a14 14 0 0 1 28 0v6" />
      <path className="state-art-accent" d="M50 70c6 6 14 6 20 0" />
    </>
  );
}

const art = { plate: Plate, search: Search, error: SpilledBowl, bag: Bag } as const;

export function StateArt({ kind }: { kind: StateArtKind }) {
  const Drawing = art[kind];
  return (
    <svg className="state-art" viewBox="0 0 120 112" aria-hidden="true" focusable="false">
      <Drawing />
    </svg>
  );
}
