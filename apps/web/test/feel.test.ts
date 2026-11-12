import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { buzz, cartGrew, chime, readFeel, saveFeel, statusArrived } from "../src/feel/feel";

const store = new Map<string, string>();
let reduce = false;
const vibrate = vi.fn((pattern: number[]) => pattern.length > 0);

beforeEach(() => {
  store.clear();
  reduce = false;
  vibrate.mockClear();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    },
    matchMedia: () => ({ matches: reduce }),
    setTimeout: () => 0,
  });
  vi.stubGlobal("navigator", { vibrate });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

test("haptics are on and sound is off until the diner chooses", () => {
  expect(readFeel()).toEqual({ haptics: true, sound: false });
  saveFeel({ haptics: false, sound: true });
  expect(readFeel()).toEqual({ haptics: false, sound: true });
  store.set("awid.feel.v1", "{broken");
  expect(readFeel()).toEqual({ haptics: true, sound: false });
});

test("a short buzz marks add, place and accept, and mute silences it", () => {
  buzz("add");
  buzz("placed");
  buzz("accepted");
  expect(vibrate).toHaveBeenCalledTimes(3);
  expect(vibrate.mock.calls.every(([pattern]) => JSON.stringify(pattern).length < 40)).toBe(true);
  saveFeel({ haptics: false, sound: false });
  buzz("add");
  expect(vibrate).toHaveBeenCalledTimes(3);
});

test("reduced motion keeps the phone still unless haptics were chosen", () => {
  reduce = true;
  buzz("add");
  expect(vibrate).not.toHaveBeenCalled();
  saveFeel({ haptics: true, sound: false });
  buzz("add");
  expect(vibrate).toHaveBeenCalledTimes(1);
});

test("browsers without vibration simply stay quiet", () => {
  vi.stubGlobal("navigator", {});
  expect(() => {
    buzz("add");
  }).not.toThrow();
});

test("only growth of the cart and a new status count as moments", () => {
  expect(cartGrew(1, 2)).toBe(true);
  expect(cartGrew(2, 2)).toBe(false);
  expect(cartGrew(2, 0)).toBe(false);
  expect(statusArrived("placed", "accepted", "accepted")).toBe(true);
  expect(statusArrived("accepted", "accepted", "accepted")).toBe(false);
  expect(statusArrived(undefined, "accepted", "accepted")).toBe(false);
});

test("the chime plays only when the diner turned sound on", () => {
  const started: number[] = [];
  class FakeAudio {
    currentTime = 0;
    destination = {};
    createOscillator() {
      return {
        type: "",
        frequency: { value: 0 },
        connect: (next: unknown) => next,
        start: (at: number) => started.push(at),
        stop: () => undefined,
      };
    }
    createGain() {
      const ramp = () => undefined;
      return {
        gain: { setValueAtTime: ramp, exponentialRampToValueAtTime: ramp },
        connect: (next: unknown) => next,
      };
    }
    close() {
      return Promise.resolve();
    }
  }
  vi.stubGlobal("AudioContext", FakeAudio);
  chime();
  expect(started).toHaveLength(0);
  saveFeel({ haptics: true, sound: true });
  chime();
  expect(started).toHaveLength(2);
});
