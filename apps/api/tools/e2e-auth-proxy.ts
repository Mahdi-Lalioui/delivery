import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { request, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const loopback = "127.0.0.1";
const run = promisify(execFile);

async function certificate() {
  const directory = await mkdtemp(join(tmpdir(), "zaafran-auth-tls-"));
  try {
    const keyPath = join(directory, "key.pem");
    const certPath = join(directory, "cert.pem");
    await run("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-subj",
      `/CN=${loopback}`,
      "-addext",
      `subjectAltName=IP:${loopback}`,
      "-keyout",
      keyPath,
      "-out",
      certPath,
    ]);
    const [key, cert] = await Promise.all([readFile(keyPath), readFile(certPath)]);
    return { key, cert };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function forward(incoming: IncomingMessage, response: ServerResponse, target: URL): void {
  const upstream = request(
    target,
    {
      method: incoming.method,
      path: incoming.url,
      headers: {
        ...incoming.headers,
        "x-forwarded-host": incoming.headers.host,
        "x-forwarded-proto": "https",
      },
    },
    (result) => {
      response.writeHead(result.statusCode ?? 502, result.headers);
      result.pipe(response);
      result.once("error", () => response.destroy());
    },
  );
  upstream.once("error", () => {
    if (response.headersSent) response.destroy();
    else response.writeHead(502).end();
  });
  response.once("close", () => upstream.destroy());
  incoming.pipe(upstream);
}

export async function startAuthProxy(webOrigin: string) {
  const web = new URL(webOrigin);
  if (web.protocol !== "http:" || web.hostname !== loopback) {
    throw new Error("The authentication test proxy requires a loopback web server.");
  }
  let api: URL | undefined;
  const server = createServer(await certificate(), (incoming, response) => {
    const path = incoming.url?.split("?", 1)[0];
    const target = path === "/v1" || path?.startsWith("/v1/") ? api : web;
    if (target === undefined) response.writeHead(503).end();
    else forward(incoming, response, target);
  });
  server.listen(0, loopback);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("The authentication test proxy has no TCP address.");
  }
  return {
    origin: `https://${loopback}:${address.port.toString()}`,
    connectApi(port: number) {
      api = new URL(`http://${loopback}:${port.toString()}`);
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
        server.closeAllConnections();
      }),
  };
}
