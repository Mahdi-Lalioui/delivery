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
    const trace = await startRenderTrace(cdp);
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
        new Promise<{
          deltas: number[];
          longTasks: number[];
          animationScripts: string[];
          tiles: number;
        }>((resolve) => {
          const button = document.querySelector(".tracking-map-attribution .awid-map-action");
          button?.addEventListener(
            "click",
            () => {
              performance.mark("awid-tilt-start");
              const times: number[] = [];
              const start = performance.now();
              const longTasks: number[] = [];
              const observer = new PerformanceObserver((entries) => {
                for (const entry of entries.getEntries()) longTasks.push(entry.duration);
              });
              observer.observe({ type: "longtask" });
              const animationScripts: string[] = [];
              function scriptSummary(script: unknown): string | undefined {
                if (
                  typeof script !== "object" ||
                  script === null ||
                  !("sourceFunctionName" in script) ||
                  typeof script.sourceFunctionName !== "string" ||
                  !("sourceURL" in script) ||
                  typeof script.sourceURL !== "string" ||
                  !("duration" in script) ||
                  typeof script.duration !== "number"
                )
                  return undefined;
                return (
                  script.sourceFunctionName +
                  " " +
                  String(script.duration) +
                  "ms " +
                  (script.sourceURL.split("/").at(-1) ?? "")
                );
              }
              const animationObserver = new PerformanceObserver((entries) => {
                for (const entry of entries.getEntries()) {
                  if (!("scripts" in entry) || !Array.isArray(entry.scripts)) continue;
                  const scripts: unknown[] = entry.scripts;
                  for (const script of scripts) {
                    const summary = scriptSummary(script);
                    if (summary) animationScripts.push(summary);
                  }
                }
              });
              animationObserver.observe({ type: "long-animation-frame" });
              let last = start;
              const frame = (now: number) => {
                const delta = now - last;
                if (delta > 0) times.push(delta);
                last = now;
                if (now - start < 600) requestAnimationFrame(frame);
                else {
                  performance.mark("awid-tilt-end");
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
                    animationObserver.disconnect();
                    resolve({ deltas: times, longTasks, animationScripts, tiles });
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
    const { deltas, longTasks, animationScripts, tiles } = await frames;
    const hot = profileTilt ? await readHotFunctions(cdp) : undefined;
    const renderTrace = await trace?.();
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
        renderTrace,
        longTasks,
        animationScripts,
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

async function startRenderTrace(cdp: CDPSession) {
  if (process.env.AWID_TRACE_TRACKING_TILT !== "1") return undefined;
  const slow: { name: string; durationMs: number; ts: number }[] = [];
  let start = Infinity;
  let end = -Infinity;
  cdp.on("Tracing.dataCollected", ({ value }) => {
    for (const entry of value) {
      if (!isTraceEvent(entry)) continue;
      if (entry.name === "awid-tilt-start") start = entry.ts;
      if (entry.name === "awid-tilt-end") end = entry.ts;
      if (entry.dur === undefined || entry.dur < 20_000) continue;
      slow.push({ name: entry.name, durationMs: entry.dur / 1000, ts: entry.ts });
    }
  });
  const finished = new Promise<void>((resolve) => {
    cdp.once("Tracing.tracingComplete", () => {
      resolve();
    });
  });
  await cdp.send("Tracing.start", {
    categories: "devtools.timeline,disabled-by-default-devtools.timeline,v8,blink.user_timing",
  });
  return async () => {
    await cdp.send("Tracing.end");
    await finished;
    return slow
      .filter(({ ts }) => ts >= start && ts <= end)
      .toSorted((a, b) => b.durationMs - a.durationMs)
      .slice(0, 25);
  };
}

function isTraceEvent(entry: unknown): entry is { name: string; dur?: number; ts: number } {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "name" in entry &&
    typeof entry.name === "string" &&
    "ts" in entry &&
    typeof entry.ts === "number" &&
    (!("dur" in entry) || typeof entry.dur === "number")
  );
}
