import { connect } from "node:net";

export type ScanMedia = (bytes: Buffer) => Promise<boolean>;

const chunkSize = 64 * 1024;
const maximumReplySize = 16 * 1024;
const unavailable = "Media scanner unavailable";

export function createClamDScan(host: string, port: number, timeoutMs = 30_000): ScanMedia {
  return (bytes) =>
    new Promise((resolve, reject) => {
      const socket = connect({ host, port });
      let response = Buffer.alloc(0);
      let settled = false;

      const fail = () => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(new Error(unavailable));
      };

      socket.setTimeout(timeoutMs, fail);
      socket.on("error", fail);
      socket.on("connect", () => {
        socket.write(Buffer.from("zINSTREAM\0"));
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
          const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
          const frame = Buffer.allocUnsafe(4 + chunk.length);
          frame.writeUInt32BE(chunk.length, 0);
          chunk.copy(frame, 4);
          socket.write(frame);
        }
        socket.end(Buffer.alloc(4));
      });
      socket.on("data", (data) => {
        const chunk = typeof data === "string" ? Buffer.from(data) : data;
        if (response.length + chunk.length > maximumReplySize) {
          fail();
          return;
        }
        response = Buffer.concat([response, chunk]);
      });
      socket.on("end", () => {
        if (settled) return;
        settled = true;
        const verdict = response.toString("utf8").replace(/\0+$/u, "").trim();
        if (/^stream: OK$/u.test(verdict)) {
          resolve(true);
        } else if (/^stream: .+ FOUND$/u.test(verdict)) {
          resolve(false);
        } else {
          reject(new Error(unavailable));
        }
      });
    });
}
