import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const stepMs = 30_000;
const nonceBytes = 12;
const tagBytes = 16;
const minimumSeedBytes = 16;

function hotp(secret: Uint8Array, step: number): Buffer {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", secret).update(counter).digest();
  const offset = digest.readUInt8(digest.length - 1) & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return Buffer.from(value.toString().padStart(6, "0"), "ascii");
}

export function matchTotp({
  secret,
  code,
  now,
}: {
  readonly secret: Uint8Array;
  readonly code: string;
  readonly now: Date;
}): number | undefined {
  if (secret.length < minimumSeedBytes) return undefined;
  const step = Math.floor(now.getTime() / stepMs);
  if (!Number.isSafeInteger(step) || step < 0 || !/^[0-9]{6}$/.test(code)) return undefined;
  const candidate = Buffer.from(code, "ascii");
  let matched: number | undefined;
  for (let window = Math.max(0, step - 1); window <= step + 1; window += 1) {
    if (timingSafeEqual(hotp(secret, window), candidate)) matched = window;
  }
  return matched;
}

type SecretKey = { readonly key: Uint8Array; readonly userId: string };

export function sealTotpSecret({
  key,
  userId,
  secret,
}: SecretKey & { secret: Uint8Array }): Buffer {
  if (secret.length < minimumSeedBytes) throw new RangeError("TOTP seed is too short.");
  const nonce = randomBytes(nonceBytes);
  const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: tagBytes });
  cipher.setAAD(Buffer.from(userId, "utf8"));
  const encrypted = Buffer.concat([cipher.update(secret), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
}

export function openTotpSecret({
  key,
  userId,
  sealed,
}: SecretKey & { sealed: Uint8Array }): Buffer | undefined {
  const bodyStart = nonceBytes + tagBytes;
  if (sealed.length < bodyStart + minimumSeedBytes) return undefined;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, sealed.subarray(0, nonceBytes), {
      authTagLength: tagBytes,
    });
    decipher.setAAD(Buffer.from(userId, "utf8"));
    decipher.setAuthTag(sealed.subarray(nonceBytes, bodyStart));
    return Buffer.concat([decipher.update(sealed.subarray(bodyStart)), decipher.final()]);
  } catch {
    return undefined;
  }
}
