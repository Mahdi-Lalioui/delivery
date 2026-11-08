import type { BulkPriceState } from "./bulk-price-flow";
import type { BulkFormPatch, BulkPriceForm } from "./bulk-price-form";

export interface BulkPriceControls {
  readonly form: BulkPriceForm;
  readonly state: BulkPriceState;
  readonly isUndoOffered: boolean;
  readonly pending: boolean;
  readonly changeForm: (patch: BulkFormPatch) => void;
  readonly toggleItem: (itemId: string) => void;
  readonly toggleAll: () => void;
  readonly preview: () => void;
  readonly apply: () => void;
  readonly undo: () => void;
  readonly reset: () => void;
}
