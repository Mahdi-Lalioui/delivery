// DESIGN §7.1-3: the item thumbnail arcs into the cart button (~420 ms). Uses the Web Animations
// API, which the CSP allows (inline style attributes are blocked).

type PointXY = { x: number; y: number };

const durationMs = 420;
const reducedMs = 120;

/** Keyframes along a quadratic Bézier that bows above the straight line, shrinking as it lands. */
export function arcKeyframes(input: { from: PointXY; to: PointXY; steps: number }): Keyframe[] {
  const dx = input.to.x - input.from.x;
  const dy = input.to.y - input.from.y;
  // The control point sits above both ends, so the path always rises first.
  const control = { x: dx / 2, y: Math.min(0, dy) - Math.abs(dx) * 0.6 - 80 };
  return Array.from({ length: input.steps + 1 }, (_, step) => {
    const t = step / input.steps;
    const x = 2 * (1 - t) * t * control.x + t * t * dx;
    const y = 2 * (1 - t) * t * control.y + t * t * dy;
    const scale = Math.round((1 - 0.7 * t) * 1000) / 1000;
    const opacity = Math.round((1 - 0.4 * t) * 1000) / 1000;
    const transform = `translate(${round(x)}px, ${round(y)}px) scale(${String(scale)})`;
    return { transform, opacity, offset: t };
  });
}

function round(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function centre(rect: DOMRect): PointXY {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Pins the clone exactly over its source, out of the page flow, whatever the source's own CSS. */
function pinOver(ghost: HTMLElement, rect: DOMRect) {
  const { style } = ghost; // CSSOM writes are allowed by the CSP; inline attributes are not
  style.position = "fixed";
  style.left = `${String(rect.left)}px`;
  style.top = `${String(rect.top)}px`;
  style.width = `${String(rect.width)}px`;
  style.height = `${String(rect.height)}px`;
  style.margin = "0";
}

/**
 * Where `target` will be once the animations moving it (such as the cart bar sliding in for the
 * first item) have finished, so the arc lands on the bar rather than chasing it.
 */
function settledRect(target: HTMLElement): DOMRect {
  const moving = document.getAnimations().filter((animation) => {
    const element = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
    return element instanceof Element && element.contains(target);
  });
  const saved = moving.map((animation) => animation.currentTime);
  for (const animation of moving) {
    const end = animation.effect?.getComputedTiming().endTime;
    if (typeof end === "number" && Number.isFinite(end)) animation.currentTime = end;
  }
  const rect = target.getBoundingClientRect();
  moving.forEach((animation, index) => {
    animation.currentTime = saved[index] ?? null;
  });
  return rect;
}

/** Flies a clone of `source` into `target`; resolves when it lands. Reduced motion just fades. */
export async function flyToCart(source: HTMLElement, target: HTMLElement): Promise<void> {
  const isReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ghost = source.cloneNode(true);
  if (!(ghost instanceof HTMLElement)) return;
  const from = source.getBoundingClientRect();
  ghost.classList.add("fly-to-cart-ghost");
  ghost.setAttribute("aria-hidden", "true");
  pinOver(ghost, from);
  document.body.append(ghost);
  const animation = isReduced
    ? ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reducedMs })
    : ghost.animate(
        arcKeyframes({ from: centre(from), to: centre(settledRect(target)), steps: 12 }),
        {
          duration: durationMs,
          easing: "cubic-bezier(0.3, 0, 0.8, 0.15)",
        },
      );
  // Frames pause in background tabs; never leave the clone floating over the page.
  const cleanup = window.setTimeout(() => {
    animation.cancel();
  }, durationMs + 300);
  try {
    await animation.finished;
  } catch {
    // Cancelled by the timeout above: the clone is removed below all the same.
  } finally {
    window.clearTimeout(cleanup);
    ghost.remove();
    target.classList.remove("cart-count-spring");
    // Restart the spring on the cart count (DESIGN: "the cart count springs").
    target.getBoundingClientRect();
    if (!isReduced) target.classList.add("cart-count-spring");
  }
}
