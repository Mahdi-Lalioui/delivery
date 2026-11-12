import { isIP } from "node:net";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { pushPublicKey } from "@zaafran/contracts/push";

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

function isInternalOsrmOrigin(input: string): boolean {
  const url = URL.parse(input);
  return (
    url?.origin === input &&
    (url.protocol === "http:" || url.protocol === "https:") &&
    (url.hostname === "osrm" || loopback.has(url.hostname))
  );
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

function isWebhookUrl(value: string): boolean {
  const url = URL.parse(value);
  return url?.protocol === "https:" && !url.username && !url.password && !url.hash;
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
    AUTH_SMS_WEBHOOK_URL: z.string().refine(isWebhookUrl).optional(),
    AUTH_SMS_WEBHOOK_TOKEN: z
      .string()
      .min(1)
      .max(2048)
      .regex(/^[!-~]+$/u)
      .optional(),
    AUTH_TWILIO_ACCOUNT_SID: z
      .string()
      .regex(/^AC[0-9A-Fa-f]{32}$/)
      .optional(),
    AUTH_TWILIO_AUTH_TOKEN: z
      .string()
      .min(1)
      .max(256)
      .regex(/^[!-~]+$/u)
      .optional(),
    AUTH_TWILIO_FROM: z
      .string()
      .regex(/^(?:\+[1-9][0-9]{6,14}|[A-Za-z0-9 ]{1,11})$/u)
      .optional(),
    AUTH_RESEND_API_KEY: z
      .string()
      .min(1)
      .max(256)
      .regex(/^[!-~]+$/u)
      .optional(),
    AUTH_RESEND_FROM: z.email().max(254).optional(),
    OSRM_INTERNAL_ORIGIN: z.string().refine(isInternalOsrmOrigin).optional(),
    VAPID_PUBLIC_KEY: pushPublicKey.optional(),
    AUTH_OTP_KEY: key,
    AUTH_TOTP_KEY: key,
    MEDIA_STORAGE_ROOT: z
      .string()
      .refine(isAbsolute, "Media storage root must be an absolute path")
      .default(() => join(tmpdir(), "zaafran-media")),
  })
  .refine(({ AUTH_OTP_KEY, AUTH_TOTP_KEY }) => AUTH_OTP_KEY !== AUTH_TOTP_KEY, {
    path: ["AUTH_TOTP_KEY"],
    message: "Authentication keys must be different.",
  })
  .refine(
    ({ AUTH_SMS_WEBHOOK_URL, AUTH_SMS_WEBHOOK_TOKEN }) =>
      Boolean(AUTH_SMS_WEBHOOK_URL) === Boolean(AUTH_SMS_WEBHOOK_TOKEN),
    {
      path: ["AUTH_SMS_WEBHOOK_URL"],
      message: "Set both authentication SMS variables or omit both.",
    },
  )
  .refine(
    ({ AUTH_TWILIO_ACCOUNT_SID: sid, AUTH_TWILIO_AUTH_TOKEN: token, AUTH_TWILIO_FROM: from }) =>
      [sid, token, from].every(Boolean) || [sid, token, from].every((value) => value === undefined),
    {
      path: ["AUTH_TWILIO_ACCOUNT_SID"],
      message: "Set all Twilio settings or omit all of them.",
    },
  )
  .refine(
    ({ AUTH_RESEND_API_KEY: apiKey, AUTH_RESEND_FROM: from }) => Boolean(apiKey) === Boolean(from),
    {
      path: ["AUTH_RESEND_FROM"],
      message: "Set both Resend settings or omit both.",
    },
  );

export function readApiEnvironment(environment: Readonly<Record<string, string | undefined>>) {
  return apiEnvironment.parse(environment);
}
