import { expect, type CDPSession, type Locator, type Page } from "@playwright/test";

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
    const cold = await sampleTilt(page, action, {
      phase: "cold",
      cdp,
      profile: process.env.AWID_PROFILE_TRACKING_TILT === "1",
    });
    let warm: Awaited<ReturnType<typeof sampleTilt>> | undefined;
    if (process.env.AWID_WARM_TRACKING_TILT === "1") {
      await action.click();
      await expect(action).toHaveAttribute("aria-pressed", "false");
      // Allow the 600 ms return to flat and the following render work to settle.
      await page.waitForTimeout(1_200);
      warm = await sampleTilt(page, action, { phase: "warm", cdp, profile: false });
    }
    const renderTrace = await trace?.();
    process.stdout.write(
      JSON.stringify({ route: "connected-tracking", ...cold, renderTrace: renderTrace?.cold }) +
        "\n",
    );
    if (warm) {
      process.stdout.write(
        JSON.stringify({
          route: "connected-tracking-warm",
          ...warm,
          renderTrace: renderTrace?.warm,
        }) + "\n",
      );
    }
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await cdp.send("Network.disable");
    await cdp.detach();
  }
}

type TiltPhase = "cold" | "warm";

async function sampleTilt(
  page: Page,
  action: Locator,
  { phase, cdp, profile }: { phase: TiltPhase; cdp: CDPSession; profile: boolean },
) {
  const frames = page.evaluate(
    (phase) =>
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
            performance.mark(`awid-tilt-${phase}-start`);
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
                performance.mark(`awid-tilt-${phase}-end`);
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
    phase,
  );
  if (profile) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.start");
  }
  await action.click();
  await expect(action).toHaveAttribute("aria-pressed", "true");
  const { deltas, longTasks, animationScripts, tiles } = await frames;
  const hot = profile ? await readHotFunctions(cdp) : undefined;
  const ordered = deltas.toSorted((a, b) => a - b);
  const intervals = deltas.slice(1);
  const activeElapsed = intervals.reduce((sum, delta) => sum + delta, 0);
  const elapsed = deltas.reduce((sum, delta) => sum + delta, 0);
  return {
    frames: deltas.length,
    elapsed,
    fps: Math.round((1_000 * deltas.length) / elapsed),
    firstFrameMs: deltas[0],
    activeFps: Math.round((1_000 * intervals.length) / activeElapsed),
    maxFrameMs: ordered.at(-1),
    p95FrameMs: ordered[Math.ceil(ordered.length * 0.95) - 1],
    hot,
    longTasks,
    animationScripts,
    tiles,
    longFrames: deltas.filter((delta) => delta > 1_000 / 60 + 4).length,
  };
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

type TraceEvent = {
  name: string;
  ts: number;
  pid: number;
  tid: number;
  dur?: number;
  tdur?: number;
};

type TraceSpan = TraceEvent & { dur: number };

function summarizeTrace(phase: TiltPhase, marks: Map<string, TraceEvent>, spans: TraceSpan[]) {
  const start = marks.get(`awid-tilt-${phase}-start`);
  const end = marks.get(`awid-tilt-${phase}-end`);
  if (!start || !end) return undefined;
  const events = spans.filter(({ ts, dur }) => ts < end.ts && ts + dur > start.ts);
  const onMainThread = ({ pid, tid }: TraceSpan) => pid === start.pid && tid === start.tid;
  const mainTask = events
    .filter((event) => event.name === "RunTask" && event.dur >= 20_000 && onMainThread(event))
    .toSorted((a, b) => b.dur - a.dur)[0];
  const summarize = ({ name, ts, dur, tdur, pid, tid }: TraceSpan) => ({
    name,
    startMs: (ts - start.ts) / 1_000,
    durationMs: dur / 1_000,
    threadMs: tdur === undefined ? undefined : tdur / 1_000,
    pid,
    tid,
    mainThread: pid === start.pid && tid === start.tid,
  });
  return {
    slow: events
      .filter(({ dur }) => dur >= 20_000)
      .toSorted((a, b) => b.dur - a.dur)
      .slice(0, 12)
      .map(summarize),
    mainTaskDetails:
      mainTask &&
      spans
        .filter(
          (event) =>
            event !== mainTask &&
            onMainThread(event) &&
            event.ts >= mainTask.ts &&
            event.ts + event.dur <= mainTask.ts + mainTask.dur,
        )
        .toSorted((a, b) => b.dur - a.dur)
        .slice(0, 16)
        .map(summarize),
  };
}

async function startRenderTrace(cdp: CDPSession) {
  if (process.env.AWID_TRACE_TRACKING_TILT !== "1") return undefined;
  const marks = new Map<string, TraceEvent>();
  const spans: TraceSpan[] = [];
  cdp.on("Tracing.dataCollected", ({ value }) => {
    for (const entry of value) {
      if (!isTraceEvent(entry)) continue;
      if (entry.name.startsWith("awid-tilt-")) marks.set(entry.name, entry);
      if (entry.dur !== undefined && entry.dur >= 1_000) spans.push({ ...entry, dur: entry.dur });
    }
  });
  const finished = new Promise<void>((resolve) => {
    cdp.once("Tracing.tracingComplete", () => {
      resolve();
    });
  });
  await cdp.send("Tracing.start", {
    categories:
      "devtools.timeline,disabled-by-default-devtools.timeline,v8,disabled-by-default-v8.gc,blink.user_timing",
  });
  return async () => {
    await cdp.send("Tracing.end");
    await finished;
    return {
      cold: summarizeTrace("cold", marks, spans),
      warm: summarizeTrace("warm", marks, spans),
    };
  };
}

function isTraceEvent(entry: unknown): entry is TraceEvent {
  if (typeof entry !== "object" || entry === null) return false;
  const hasDuration = !("dur" in entry) || typeof entry.dur === "number";
  const hasThreadDuration = !("tdur" in entry) || typeof entry.tdur === "number";
  return hasDuration && hasThreadDuration && hasTraceCoordinates(entry);
}

function hasTraceCoordinates(entry: object) {
  return (
    "name" in entry &&
    typeof entry.name === "string" &&
    "ts" in entry &&
    typeof entry.ts === "number" &&
    "pid" in entry &&
    typeof entry.pid === "number" &&
    "tid" in entry &&
    typeof entry.tid === "number"
  );
}
