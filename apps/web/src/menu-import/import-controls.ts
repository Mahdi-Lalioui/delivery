import type { MenuImportFileError } from "./import-file";
import type { MenuImportState } from "./import-flow";

/** What the import panel reads and calls; produced by `useMenuImport`. */
export interface MenuImportControls {
  readonly state: MenuImportState;
  readonly pending: boolean;
  readonly fileName: string | null;
  readonly fileError: MenuImportFileError | null;
  readonly chooseFile: (file: File | undefined) => void;
  readonly preview: () => void;
  readonly apply: () => void;
  readonly reset: () => void;
  readonly reload: () => void;
}
