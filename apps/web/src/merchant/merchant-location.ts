type BrowserPin =
  | { kind: "found"; latitude: string; longitude: string; approximate: boolean }
  | { kind: "unavailable" };

export async function readBrowserPin(
  geolocation: Pick<Geolocation, "getCurrentPosition"> | undefined,
): Promise<BrowserPin> {
  if (!geolocation) return { kind: "unavailable" };

  try {
    return await new Promise<BrowserPin>((resolve) => {
      geolocation.getCurrentPosition(
        ({ coords: { latitude, longitude, accuracy } }) => {
          resolve({
            kind: "found",
            latitude: String(latitude),
            longitude: String(longitude),
            approximate: accuracy > 40,
          });
        },
        () => {
          resolve({ kind: "unavailable" });
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
      );
    });
  } catch {
    return { kind: "unavailable" };
  }
}
