const localHttps =
  /^https:\/\/(?:127\.0\.0\.1|\[::1\]|(?:[a-z0-9-]+\.)*localhost)(?::[1-9][0-9]{0,4})?$/iu;

export function requireLocalTarget(baseUrl, origin) {
  if (!localHttps.test(baseUrl) || baseUrl !== origin) {
    throw new Error("Use the same local HTTPS origin for LOAD_BASE_URL and LOAD_ORIGIN");
  }
}
