const digits = "23456789CFGHJMPQRVWX";
const resolution = 8_000;

/** Ten-digit Open Location Code for validated WGS84 coordinates. */
export function addressPlusCode(latitude: number, longitude: number): string {
  // Round arithmetic noise at cell boundaries while retaining sub-cell precision.
  const cells = (coordinate: number, offset: number) =>
    Math.floor(Number(((coordinate + offset) * resolution).toFixed(8)));
  let lat = Math.min(cells(latitude, 90), 180 * resolution - 1);
  let lng = Math.min(cells(longitude === 180 ? -180 : longitude, 180), 360 * resolution - 1);
  let code = "";
  for (let pair = 0; pair < 5; pair++) {
    code = digits.charAt(lat % 20) + digits.charAt(lng % 20) + code;
    lat = Math.floor(lat / 20);
    lng = Math.floor(lng / 20);
  }
  return code.slice(0, 8) + "+" + code.slice(8);
}
