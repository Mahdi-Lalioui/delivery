import { createInterface } from "node:readline/promises";
import process from "node:process";
import { openDatabase } from "@zaafran/db/database";
import qrcode from "qrcode-generator";
import { bootstrapAdmin } from "./admin-bootstrap.js";

class BootstrapRefusal extends Error {}

function setupText(seed: Buffer, userId: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = Array.from(seed, (byte) => byte.toString(2).padStart(8, "0")).join("");
  const secret = (bits.match(/.{1,5}/g) ?? [])
    .map((group) => alphabet.charAt(Number.parseInt(group.padEnd(5, "0"), 2)))
    .join("");
  const qr = qrcode(0, "M");
  qr.addData(`otpauth://totp/AWID:${userId}?secret=${secret}&issuer=AWID`);
  qr.make();
  const rows: string[] = [];
  const size = qr.getModuleCount();
  const dark = (row: number, col: number) =>
    row >= 0 && row < size && col >= 0 && col < size && qr.isDark(row, col);
  for (let row = -4; row < size + 4; row += 2) {
    let line = "\x1b[30;47m";
    for (let col = -4; col < size + 4; col++) {
      const top = dark(row, col);
      const bottom = dark(row + 1, col);
      line += top ? (bottom ? "█" : "▀") : bottom ? "▄" : " ";
    }
    rows.push(line + "\x1b[0m");
  }
  return `\n${rows.join("\n")}\n\nTOTP secret: ${secret}\nEnroll it now and clear this terminal's scrollback.\n`;
}

function readOptions() {
  const args = process.argv.slice(2);
  if (
    !process.stdin.isTTY ||
    !process.stdout.isTTY ||
    args.length > 1 ||
    args.some((arg) => arg !== "--force")
  ) {
    throw new BootstrapRefusal("Run this command interactively over SSH, with optional --force.");
  }
  const { DATABASE_URL, AUTH_TOTP_KEY } = process.env;
  if (!DATABASE_URL || !AUTH_TOTP_KEY || !/^[a-fA-F0-9]{64}$/.test(AUTH_TOTP_KEY)) {
    throw new BootstrapRefusal("Configure the owner database URL and the deployed API TOTP key.");
  }
  return {
    databaseUrl: DATABASE_URL,
    key: Buffer.from(AUTH_TOTP_KEY, "hex"),
    force: args.includes("--force"),
  };
}

async function run() {
  const { databaseUrl, key, force } = readOptions();
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  const input = await (async () => {
    try {
      const email = await terminal.question("Verified account email: ");
      const operator = await terminal.question("SSH operator login: ");
      return { email, operator: operator.trim() };
    } finally {
      terminal.close();
    }
  })();
  const database = openDatabase(databaseUrl);
  try {
    const result = await bootstrapAdmin(database, {
      ...input,
      key,
      force,
    });
    switch (result.kind) {
      case "created":
        try {
          process.stdout.write(setupText(result.secret, result.userId));
        } finally {
          result.secret.fill(0);
        }
        return;
      case "no_account":
        throw new BootstrapRefusal(
          "No active account has that verified email. Sign in by email first.",
        );
      case "already_admin":
        throw new BootstrapRefusal(
          "That account is already an administrator. Its setup is not displayed again.",
        );
      case "admin_exists":
        throw new BootstrapRefusal(
          "An administrator already exists. Use --force only to add a different administrator.",
        );
    }
  } finally {
    await database.close();
  }
}

try {
  await run();
} catch (error) {
  // Only emit explicit CLI messages. Database and validation errors may contain identifiers.
  const safe = error instanceof BootstrapRefusal;
  process.stderr.write(
    safe
      ? error.message + "\n"
      : "Administrator bootstrap failed. Check the account and database setup.\n",
  );
  process.exitCode = 1;
}
