import { isIP } from "node:net";
import { z } from "zod";

const loopback = new Set(["127.0.0.1", "localhost", "[::1]"]);
const key = z
  .string()
  .length(64)
  .regex(/^[A-Fa-f0-9]+$/)
  .transform((value) => value.toLowerCase());

function isOrigin(input: string): boolean {
  const url = URL.parse(input);
  if (url?.origin !== input) return false;
  return url.protocol === "https:" || (url.protocol === "http:" && loopback.has(url.hostname));
}

function isProxyAddress(input: string): boolean {
  const [address, prefix, extra] = input.split("/");
  if (!address || extra !== undefined) return false;
  const family = isIP(address);
  if (!family) return false;
  if (prefix === undefined) return true;
  const bits = Number(prefix);
  return /^[0-9]{1,3}$/.test(prefix) && bits > 0 && bits <= (family === 4 ? 32 : 128);
}

const apiEnvironment = z
  .object({
    DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
    API_HOST: z.string().min(1).default("127.0.0.1"),
    API_PORT: z
      .string()
      .regex(/^\d{1,5}$/)
      .transform(Number)
      .pipe(z.int().max(65_535))
      .default(3002),
    API_TRUSTED_PROXY: z.string().refine(isProxyAddress).optional(),
    AUTH_PUBLIC_ORIGIN: z.string().refine(isOrigin),
    AUTH_OTP_KEY: key,
    AUTH_TOTP_KEY: key,
  })
  .refine(({ AUTH_OTP_KEY, AUTH_TOTP_KEY }) => AUTH_OTP_KEY !== AUTH_TOTP_KEY, {
    path: ["AUTH_TOTP_KEY"],
    message: "Authentication keys must be different.",
  });

export function readApiEnvironment(environment: Readonly<Record<string, string | undefined>>) {
  return apiEnvironment.parse(environment);
}
