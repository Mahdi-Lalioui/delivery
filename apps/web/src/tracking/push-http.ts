import { pushPublicKeyOutput, pushSubscriptionInput } from "@zaafran/contracts/push";

const base = {
  credentials: "same-origin",
  cache: "no-store",
  redirect: "error",
} satisfies RequestInit;

export type PushOutcome = "on" | "denied" | "unsupported" | "error";

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Decodes the VAPID key (base64url) into the bytes PushManager expects. */
export function decodeKey(key: string): Uint8Array<ArrayBuffer> {
  const base64 = key.replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function readPublicKey(): Promise<string | null> {
  const response = await fetch("/v1/push/public-key", base);
  if (!response.ok) return null;
  const output = pushPublicKeyOutput.safeParse(await response.json());
  return output.success ? output.data.publicKey : null;
}

/** Asks permission, subscribes this browser and registers it with the session. */
export async function enablePush(): Promise<PushOutcome> {
  if (!isPushSupported()) return "unsupported";
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "denied";
    const publicKey = await readPublicKey();
    if (publicKey === null) return "error";
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeKey(publicKey),
    });
    const payload = pushSubscriptionInput.safeParse(subscription.toJSON());
    if (!payload.success) return "error";
    const response = await fetch("/v1/me/push-subscriptions", {
      ...base,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload.data),
    });
    return response.ok ? "on" : "error";
  } catch {
    return "error";
  }
}
