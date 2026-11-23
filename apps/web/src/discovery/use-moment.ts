import { useSyncExternalStore } from "react";
import { momentAt, serverMoment, type Moment } from "./time-of-day";

function subscribe() {
  return () => undefined;
}

/** The diner's moment of the day: the server renders `serverMoment`, the client its own clock. */
export function useMoment(): Moment {
  return useSyncExternalStore(
    subscribe,
    () => momentAt(new Date().getHours()),
    () => serverMoment,
  );
}
