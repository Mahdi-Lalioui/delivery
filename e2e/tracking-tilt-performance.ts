import { expect, type CDPSession, type Page } from "@playwright/test";

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
        new Promise<{ deltas: number[]; longTasks: number[]; tiles: number }>((resolve) => {
          const button = document.querySelector(".tracking-map-attribution .awid-map-action");
          button?.addEventListener(
            "click",
            () => {
              const times: number[] = [];
              const start = performance.now();
              const longTasks: number[] = [];
              const observer = new PerformanceObserver((entries) => {
                for (const entry of entries.getEntries()) longTasks.push(entry.duration);
              });
              observer.observe({ type: "longtask" });
              let last = start;
              const frame = (now: number) => {
                const delta = now - last;
                if (delta > 0) times.push(delta);
                last = now;
                if (now - start < 600) requestAnimationFrame(frame);
                else {
                  const tiles = performance
                    .getEntriesByType("resource")
                    .filter(
                      (entry) =>
                        new URL(entry.name).pathname.startsWith("/tiles/algeria/") &&
                        entry.startTime + entry.duration >= start &&
                        entry.startTime + entry.duration <= now,
                    ).length;
                  setTimeout(() => {
                    observer.disconnect();
                    resolve({ deltas: times, longTasks, tiles });
                  }, 0);
                }
              };
              requestAnimationFrame(frame);
            },
            { once: true },
          );
        }),
    );
    const profileTilt = process.env.AWID_PROFILE_TRACKING_TILT === "1";
    if (profileTilt) {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.start");
    }
    await action.click();
    await expect(action).toHaveAttribute("aria-pressed", "true");
    const { deltas, longTasks, tiles } = await frames;
    const hot = profileTilt ? await readHotFunctions(cdp) : undefined;
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
        hot,
        longTasks,
        tiles,
        longFrames: deltas.filter((delta) => delta > 1_000 / 60 + 4).length,
      }) + "\n",
    );
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await cdp.send("Network.disable");
    await cdp.detach();
  }
}

async function readHotFunctions(cdp: CDPSession) {
  const { profile } = await cdp.send("Profiler.stop");
  await cdp.send("Profiler.disable");
  return profile.nodes
    .filter((node) => (node.hitCount ?? 0) > 0)
    .toSorted((a, b) => (b.hitCount ?? 0) - (a.hitCount ?? 0))
    .slice(0, 12)
    .map(({ callFrame, hitCount }) => ({
      name: callFrame.functionName,
      hits: hitCount,
      line: callFrame.lineNumber,
      column: callFrame.columnNumber,
      script: callFrame.url.split("/").at(-1),
    }));
}
