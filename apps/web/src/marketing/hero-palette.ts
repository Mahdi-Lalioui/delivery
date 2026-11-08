// The hero is an illustration of Algiers at golden hour, so it keeps the same colours in light and
// dark themes. Every value is a DESIGN.md token: §3.1 light palette and the §3.4 "golden hour"
// gradient, which DESIGN reserves for the landing hero and the 3D sky.

export const heroPalette = {
  /** §3.1 surface — whitewashed Casbah walls. */
  wall: "#FFFFFF",
  /** §3.1 surface-2 "Sand" — roofs and domes. */
  roof: "#F4EEE4",
  /** §3.1 surface-3 "Dune" — shaded bases and the tower. */
  shade: "#EAE2D6",
  /** §3.1 info "Mediterranean". */
  sea: "#1C5D85",
  /** §3.4 golden hour gradient, top to bottom of the sky. */
  goldenSky: "#F6AE3E",
  duskSky: "#C2410C",
  nightSky: "#2A1E14",
  /** §3.1 primary "Saffron" — the light trail, the sun and lit windows. */
  saffron: "#F29E1F",
} as const;
