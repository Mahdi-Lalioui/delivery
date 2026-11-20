import { expect, type Page } from "@playwright/test";

export async function measureConnectedTrackingTilt(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 75,
      downloadThroughput: 500_000,
      uploadThroughput: 187_500,
      connectionType: "cellular4g",
    });
    const tile = page.waitForResponse(
      (response) => new URL(response.url()).pathname.startsWith("/tiles/algeria/") && response.ok(),
    );
    await page.reload();
    await tile;
    const action = page.locator(".tracking-map-attribution .awid-map-action");
    await expect(action).toHaveAttribute("aria-pressed", "false");
    await action.scrollIntoViewIfNeeded();
    const frames = page.evaluate(
      () =>
        new Promise<number[]>((resolve) => {
          const button = document.querySelector(".tracking-map-attribution .awid-map-action");
          button?.addEventListener(
            "click",
            () => {
              const times: number[] = [];
              const start = performance.now();
              let last = start;
              const frame = (now: number) => {
                const delta = now - last;
                if (delta > 0) times.push(delta);
                last = now;
                if (now - start < 600) requestAnimationFrame(frame);
                else resolve(times);
              };
              requestAnimationFrame(frame);
            },
            { once: true },
          );
        }),
    );
    await action.click();
    await expect(action).toHaveAttribute("aria-pressed", "true");
    const deltas = await frames;
    expect(deltas.length).toBeGreaterThan(0);
    const ordered = deltas.toSorted((a, b) => a - b);
    const intervals = deltas.slice(1);
    const activeElapsed = intervals.reduce((sum, delta) => sum + delta, 0);
    const elapsed = deltas.reduce((sum, delta) => sum + delta, 0);
    process.stdout.write(
      JSON.stringify({
        route: "connected-tracking",
        frames: deltas.length,
        elapsed,
        fps: Math.round((1_000 * deltas.length) / elapsed),
        firstFrameMs: deltas[0],
        activeFps: Math.round((1_000 * intervals.length) / activeElapsed),
        maxFrameMs: ordered.at(-1),
        p95FrameMs: ordered[Math.ceil(ordered.length * 0.95) - 1],
        longFrames: deltas.filter((delta) => delta > 1_000 / 60 + 4).length,
      }) + "\n",
    );
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await cdp.send("Network.disable");
    await cdp.detach();
  }
}
