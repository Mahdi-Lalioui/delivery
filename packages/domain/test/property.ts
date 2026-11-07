import fc, { type IProperty } from "fast-check";

export function assertDomainProperty<Arguments>(property: IProperty<Arguments>): void {
  fc.assert(property, { numRuns: 1_000, seed: 20_261_107 });
}
