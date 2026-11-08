// Drizzle reads timestamptz as text so its columns can choose a mapping.
// Raw repository queries return Dates at the repository boundary.
export const timestampParsers = {
  1184: (value: string): Date => new Date(value),
};
