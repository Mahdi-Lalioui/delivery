import type { BulkPriceState } from "./bulk-price-flow";
import type { BulkPriceSelection } from "./bulk-price-http";

type Mode = BulkPriceSelection["adjustment"]["kind"];
export type RoundingUnit = BulkPriceSelection["roundingUnit"];
type Direction = "raise" | "lower";

interface BulkPriceForm {
  readonly selectedIds: ReadonlySet<string>;
  readonly direction: Direction;
  readonly mode: Mode;
  readonly amount: string;
  readonly roundingUnit: RoundingUnit;
  readonly formError: "invalidAmount" | "noSelection" | null;
}

export interface BulkPriceControls {
  readonly form: BulkPriceForm;
  readonly state: BulkPriceState;
  readonly isUndoOffered: boolean;
  readonly pending: boolean;
  readonly changeForm: (
    patch: Partial<Pick<BulkPriceForm, "direction" | "mode" | "amount" | "roundingUnit">>,
  ) => void;
  readonly toggleItem: (itemId: string) => void;
  readonly toggleAll: () => void;
  readonly preview: () => void;
  readonly apply: () => void;
  readonly undo: () => void;
  readonly reset: () => void;
}
