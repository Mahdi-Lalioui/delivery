function getNationalMobileNumber(input: string): string | undefined {
  const digits = input
    .trim()
    .replace(/[٠-٩۰-۹]/g, (digit) => {
      const zero = digit >= "۰" ? "۰" : "٠";
      return String(digit.charCodeAt(0) - zero.charCodeAt(0));
    })
    .replace(/[-\p{Zs}]/gu, "");
  const match = /^(?:0|\+213|00213)([567][0-9]{8})$/.exec(digits);
  return match?.[1];
}

export function normalizeAlgerianPhone(input: string): string | undefined {
  const nationalNumber = getNationalMobileNumber(input);
  return nationalNumber === undefined ? undefined : `+213${nationalNumber}`;
}

export function formatAlgerianPhone(input: string): string | undefined {
  const nationalNumber = getNationalMobileNumber(input);
  return nationalNumber?.replace(/^([0-9]{3})([0-9]{2})([0-9]{2})([0-9]{2})$/, "0$1 $2 $3 $4");
}
