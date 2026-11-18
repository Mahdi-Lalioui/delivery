import { createServer, type Server, type Socket } from "node:net";
import { afterEach, expect, test } from "vitest";
import { createClamDScan } from "../src/media-scanner.js";

type ScanMedia = (bytes: Buffer) => Promise<boolean>;
const cleanup: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

async function fakeClamd(reply: string): Promise<{ port: number; received: () => Buffer }> {
  let payload = Buffer.alloc(0);
  const server = createServer((socket) => {
    let input = Buffer.alloc(0);
    let commandRead = false;
    socket.on("data", (data) => {
      const chunk = typeof data === "string" ? Buffer.from(data) : data;
      input = Buffer.concat([input, chunk]);
      if (!commandRead) {
        if (input.length < 10) return;
        if (input.subarray(0, 10).toString("binary") !== "zINSTREAM\0") {
          socket.destroy(new Error("Unexpected scanner command"));
          return;
        }
        commandRead = true;
        input = input.subarray(10);
      }
      while (input.length >= 4) {
        const size = input.readUInt32BE(0);
        if (input.length < size + 4) return;
        input = input.subarray(4);
        if (size === 0) {
          socket.end(Buffer.from(reply + "\0"));
          return;
        }
        payload = Buffer.concat([payload, input.subarray(0, size)]);
        input = input.subarray(size);
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("No TCP address");
  cleanup.push(() => closeServer(server));
  return { port: address.port, received: () => payload };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => {
      resolve();
    });
  });
}

function makeScanner(port: number, timeoutMs = 500): ScanMedia {
  return createClamDScan("127.0.0.1", port, timeoutMs);
}

test("streams file bytes with INSTREAM and accepts a clean verdict", async () => {
  const daemon = await fakeClamd("stream: OK");
  const file = Buffer.from([0, 1, 2, 3, 255]);

  await expect(makeScanner(daemon.port)(file)).resolves.toBe(true);
  expect(daemon.received()).toEqual(file);
});

test("rejects a malware verdict without treating it as a scanner failure", async () => {
  const daemon = await fakeClamd("stream: Eicar-Test-Signature FOUND");

  await expect(makeScanner(daemon.port)(Buffer.from("synthetic marker"))).resolves.toBe(false);
});

test("fails closed on an INSTREAM protocol error", async () => {
  const daemon = await fakeClamd("stream: INSTREAM size limit exceeded. ERROR");

  await expect(makeScanner(daemon.port)(Buffer.from("synthetic image"))).rejects.toThrow(
    "Media scanner unavailable",
  );
});

test("fails closed when clamd is unreachable or times out", async () => {
  const daemon = await fakeClamd("stream: OK");

  const reserved = createServer();
  await new Promise<void>((resolve) => reserved.listen(0, "127.0.0.1", resolve));
  const reservedAddress = reserved.address();
  if (reservedAddress === null || typeof reservedAddress === "string") {
    throw new Error("No TCP address");
  }
  await closeServer(reserved);

  const idleSockets: Socket[] = [];
  const idle = createServer((socket) => {
    idleSockets.push(socket);
  });
  await new Promise<void>((resolve) => idle.listen(0, "127.0.0.1", resolve));
  const address = idle.address();
  if (address === null || typeof address === "string") throw new Error("No TCP address");
  cleanup.push(async () => {
    idleSockets.forEach((socket) => socket.destroy());
    await closeServer(idle);
  });

  await expect(
    makeScanner(reservedAddress.port, 10)(Buffer.from("synthetic image")),
  ).rejects.toThrow("Media scanner unavailable");
  await expect(makeScanner(address.port, 10)(Buffer.from("synthetic image"))).rejects.toThrow(
    "Media scanner unavailable",
  );
  await expect(makeScanner(daemon.port)(Buffer.from("synthetic image"))).resolves.toBe(true);
});
