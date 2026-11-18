import { createServer, type Server } from "node:net";
import { afterEach, expect, test } from "vitest";
import { createClamDScan } from "../src/media-scanner.js";

let server: Server | undefined;
const previousSecret = process.env.AWID_SCANNER_TEST_SECRET;

afterEach(async () => {
  if (previousSecret === undefined) delete process.env.AWID_SCANNER_TEST_SECRET;
  else process.env.AWID_SCANNER_TEST_SECRET = previousSecret;
  if (server?.listening) {
    await new Promise<void>((resolve) => {
      server?.close(() => {
        resolve();
      });
    });
  }
  server = undefined;
});

test("[SECURITY] sends only the upload bytes, never worker environment secrets", async () => {
  process.env.AWID_SCANNER_TEST_SECRET = "synthetic-worker-secret";
  let received = Buffer.alloc(0);
  server = createServer((socket) => {
    let input = Buffer.alloc(0);
    let commandRead = false;
    socket.on("data", (data) => {
      const chunk = typeof data === "string" ? Buffer.from(data) : data;
      input = Buffer.concat([input, chunk]);
      if (!commandRead) {
        if (input.length < 10) return;
        expect(input.subarray(0, 10).toString("binary")).toBe("zINSTREAM\0");
        input = input.subarray(10);
        commandRead = true;
      }
      while (input.length >= 4) {
        const size = input.readUInt32BE(0);
        if (input.length < size + 4) return;
        input = input.subarray(4);
        if (size === 0) {
          socket.end(Buffer.from("stream: OK\0"));
          return;
        }
        received = Buffer.concat([received, input.subarray(0, size)]);
        input = input.subarray(size);
      }
    });
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("No TCP address");

  const upload = Buffer.from("synthetic image");
  await expect(createClamDScan("127.0.0.1", address.port)(upload)).resolves.toBe(true);
  expect(received).toEqual(upload);
});
