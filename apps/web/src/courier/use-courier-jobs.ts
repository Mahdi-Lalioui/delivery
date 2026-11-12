"use client";

import { useEffect, useState } from "react";
import { readCourierJobs, type Jobs } from "./courier-http";

type View =
  | { kind: "loading" | "sign-in" | "forbidden" | "error" }
  | { kind: "ready"; data: Jobs; offline: boolean };

export function useCourierJobs() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      const result = await readCourierJobs(controller.signal);
      if (controller.signal.aborted) return;
      if (result.kind === "ready") {
        setView({ ...result, offline: false });
      } else if (result.kind === "sign-in" || result.kind === "forbidden") {
        setView({ kind: result.kind });
        return;
      } else {
        setView((current) =>
          current.kind === "ready" ? { ...current, offline: true } : { kind: "error" },
        );
      }
      timer = setTimeout(() => void load(), 8_000);
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [revision]);

  return {
    view,
    refresh: () => {
      setRevision((value) => value + 1);
    },
  };
}
