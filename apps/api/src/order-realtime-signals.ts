import type { DatabaseConnection } from "@zaafran/db/database";

type Wake = () => void;

function createChannel(sql: DatabaseConnection["sql"], channel: string) {
  const listeners = new Map<string, Set<Wake>>();
  let connecting = false;

  function connect() {
    if (connecting || listeners.size === 0) return;
    connecting = true;
    void sql
      .listen(
        channel,
        (resourceId) => {
          for (const wake of listeners.get(resourceId) ?? []) wake();
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

  return (resourceId: string, wake: Wake) => {
    const subscribed = listeners.get(resourceId) ?? new Set<Wake>();
    subscribed.add(wake);
    listeners.set(resourceId, subscribed);
    connect();
    return () => {
      subscribed.delete(wake);
      if (subscribed.size === 0) listeners.delete(resourceId);
    };
  };
}

export function createOrderRealtimeSignals(sql: DatabaseConnection["sql"]) {
  const order = createChannel(sql, "order_status_events");
  const position = createChannel(sql, "courier_position_events");
  return {
    subscribe: createChannel(sql, "merchant_order_events"),
    subscribeOrder(orderId: string, wake: Wake) {
      const stopOrder = order(orderId, wake);
      const stopPosition = position(orderId, wake);
      return () => {
        stopOrder();
        stopPosition();
      };
    },
  };
}
