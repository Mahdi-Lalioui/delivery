import { expect, test } from "vitest";
import { readApiEnvironment } from "../src/environment.ts";

test("[M0-6] validates the database URL, listener and port at startup", () => {
  const input = {
    DATABASE_URL: "postgresql://zaafran:fixture@127.0.0.1:5432/zaafran_test",
    API_HOST: "127.0.0.1",
    API_PORT: "8081",
  };
  expect(readApiEnvironment(input)).toEqual({ ...input, API_PORT: 8081 });
  for (const bad of [
    { ...input, DATABASE_URL: "https://example.test/" },
    { ...input, DATABASE_URL: "" },
    { ...input, API_PORT: "65536" },
    { ...input, API_PORT: "-1" },
    { ...input, API_HOST: "" },
  ]) {
    expect(() => readApiEnvironment(bad)).toThrow();
  }
});
