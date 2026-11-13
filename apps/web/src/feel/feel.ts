/** The diner's feel settings: short vibrations on key moments, and an optional soft chime. */
export type Feel = { haptics: boolean; sound: boolean };
type Moment = "add" | "placed" | "accepted";

const storageKey = "awid.feel.v1";

// Short and distinct: a tap for add, a double tap for place, a little rhythm for accepted.
const patterns: Record<Moment, number[]> = {
  add: [12],
  placed: [18, 40, 18],
  accepted: [10, 60, 10, 60, 30],
};

function prefersStill(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function stored(): Partial<Feel> | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const haptics: unknown = Reflect.get(value, "haptics");
    const sound: unknown = Reflect.get(value, "sound");
    return {
      ...(typeof haptics === "boolean" && { haptics }),
      ...(typeof sound === "boolean" && { sound }),
    };
  } catch {
    return null;
  }
}

/** Saved choices win; otherwise haptics follow reduced motion and the chime stays off. */
export function readFeel(): Feel {
  const saved = stored();
  return { haptics: saved?.haptics ?? !prefersStill(), sound: saved?.sound ?? false };
}

export function saveFeel(feel: Feel) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(feel));
  } catch {
    // Private mode: the choice lasts for this page only, which is acceptable.
  }
}

export function buzz(moment: Moment) {
  if (!readFeel().haptics) return;
  if (typeof navigator.vibrate !== "function") return;
  navigator.vibrate(patterns[moment]);
}

export function cartGrew(before: number, after: number): boolean {
  return after > before;
}

export function statusArrived<Status extends string>(
  before: Status | undefined,
  after: Status,
  target: Status,
): boolean {
  return before !== undefined && before !== target && after === target;
}

/** Two soft, rising notes (A5 then E6) from the Web Audio API; no audio file to download. */
export function chime() {
  if (!readFeel().sound || typeof AudioContext !== "function") return;
  const audio = new AudioContext();
  const notes = [880, 1318.5];
  notes.forEach((frequency, index) => {
    const start = audio.currentTime + index * 0.14;
    const tone = audio.createOscillator();
    const level = audio.createGain();
    tone.type = "sine";
    tone.frequency.value = frequency;
    level.gain.setValueAtTime(0.0001, start);
    level.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
    level.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
    tone.connect(level).connect(audio.destination);
    tone.start(start);
    tone.stop(start + 0.5);
  });
  window.setTimeout(() => void audio.close(), 900);
}
