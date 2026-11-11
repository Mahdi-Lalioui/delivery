import type { DatabaseConnection } from "@zaafran/db/database";

type Wake = () => void;

export function createOrderRealtimeSignals(sql: DatabaseConnection["sql"]) {
  const listeners = new Map<string, Set<Wake>>();
  let connecting = false;

  function connect() {
    if (connecting || listeners.size === 0) return;
    connecting = true;
    void sql
      .listen(
        "merchant_order_events",
        (merchantId) => {
          for (const wake of listeners.get(merchantId) ?? []) wake();
        },
        () => {
          for (const subscribed of listeners.values()) {
            for (const wake of subscribed) wake();
          }
        },
      )
      .catch(() => {
        connecting = false;
        setTimeout(connect, 5_000).unref();
      });
  }

  return {
    subscribe(merchantId: string, wake: Wake) {
      const subscribed = listeners.get(merchantId) ?? new Set<Wake>();
      subscribed.add(wake);
      listeners.set(merchantId, subscribed);
      connect();
      return () => {
        subscribed.delete(wake);
        if (subscribed.size === 0) listeners.delete(merchantId);
      };
    },
  };
}
