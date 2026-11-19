/** @param {string} value @returns {boolean} */
export function mayIgnoreLocalCertificateErrors(value) {
  try {
    const url = new globalThis.URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "localhost" ||
        url.hostname.endsWith(".localhost") ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "[::1]")
    );
  } catch {
    return false;
  }
}
