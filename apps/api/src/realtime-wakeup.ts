const heartbeatMs = 25_000;

export function createRealtimeWakeup(signal: AbortSignal) {
  let pending = false;
  let resolveWait: (() => void) | undefined;

  return {
    notify() {
      pending = true;
      resolveWait?.();
    },
    async wait() {
      if (!pending && !signal.aborted) {
        await new Promise<void>((resolve) => {
          function finish() {
            clearTimeout(timeout);
            signal.removeEventListener("abort", finish);
            resolveWait = undefined;
            resolve();
          }

          const timeout = setTimeout(finish, heartbeatMs);
          resolveWait = finish;
          signal.addEventListener("abort", finish, { once: true });
        });
      }
      pending = false;
    },
  };
}
