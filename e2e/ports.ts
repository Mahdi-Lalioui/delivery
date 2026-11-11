const laneOffset = process.env.COMPOSE_PROJECT_NAME === "lane-b" ? 100 : 0;

export const designPort = String(3200 + laneOffset);
export const productionPort = String(3201 + laneOffset);
export const authPort = String(3213 + laneOffset);

export function loopbackOrigin(port: string): string {
  return `http://127.0.0.1:${port}`;
}
