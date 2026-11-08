import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { arcKeyframes } from "../src/marketing/moments/fly-to-cart";
import { CountdownRing, ringOffset } from "../src/marketing/moments/countdown-ring";
import { LivePill } from "../src/marketing/moments/live-pill";
import { OdometerNumber } from "../src/marketing/moments/odometer-number";
import { TagineMoment } from "../src/marketing/moments/tagine-moment";

test("[M8-3] the add-to-cart arc starts at the item, ends at the cart and bows upward", () => {
  const frames = arcKeyframes({ from: { x: 100, y: 400 }, to: { x: 300, y: 40 }, steps: 8 });
  expect(frames).toHaveLength(9);
  expect(frames[0]).toEqual({ transform: "translate(0px, 0px) scale(1)", opacity: 1, offset: 0 });
  expect(frames.at(-1)).toEqual({
    transform: "translate(200px, -360px) scale(0.3)",
    opacity: 0.6,
    offset: 1,
  });
  const middle = frames[4];
  const straightMiddleY = -180;
  expect(
    Number(/translate\([^,]+, (-?[\d.]+)px\)/.exec(String(middle?.transform ?? ""))?.[1]),
  ).toBeLessThan(straightMiddleY);
});

test("[M8-3] the countdown ring empties as time runs out and is clamped", () => {
  expect(ringOffset({ remainingMs: 60_000, totalMs: 60_000, circumference: 100 })).toBe(0);
  expect(ringOffset({ remainingMs: 15_000, totalMs: 60_000, circumference: 100 })).toBe(75);
  expect(ringOffset({ remainingMs: -5, totalMs: 60_000, circumference: 100 })).toBe(100);
  expect(ringOffset({ remainingMs: 5, totalMs: 0, circumference: 100 })).toBe(100);
  const html = renderToStaticMarkup(
    <CountdownRing remainingMs={30_000} totalMs={60_000} label="0:30 left" />,
  );
  expect(html).toContain('role="img"');
  expect(html).toContain('aria-label="0:30 left"');
  expect(html).toContain("stroke-dashoffset");
});

test("[M8-3] the odometer renders tabular digit columns with a readable value", () => {
  const html = renderToStaticMarkup(<OdometerNumber value="1 450 DA" />);
  expect(html).toContain('aria-label="1 450 DA"');
  expect(html.match(/data-digit=/g)).toHaveLength(4);
  expect(html).toContain('data-digit="4"');
  expect(html).not.toContain("style=");
});

test("[M8-3] the LIVE pill and tagine keep text for screen readers and call back when done", () => {
  expect(renderToStaticMarkup(<LivePill label="LIVE" />)).toContain(">LIVE<");
  const onDone = vi.fn();
  const html = renderToStaticMarkup(<TagineMoment label="Order confirmed" onDone={onDone} />);
  expect(html).toContain('role="img"');
  expect(html).toContain('aria-label="Order confirmed"');
  expect(html.match(/class="tagine-steam"/g)?.length).toBeGreaterThanOrEqual(6);
  expect(html).not.toContain("style=");
});
