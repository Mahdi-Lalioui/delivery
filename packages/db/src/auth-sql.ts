// Drizzle reads timestamptz as text so its columns can choose a mapping.
// Raw auth queries return Dates at the repository boundary.
export const authTimestampParsers = {
  1184: (value: string): Date => new Date(value),
};
