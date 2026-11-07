export type Coordinates = {
  readonly latitude: number;
  readonly longitude: number;
};

export function isValidCoordinates({ latitude, longitude }: Coordinates): boolean {
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}
