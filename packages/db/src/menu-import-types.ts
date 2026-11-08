export interface ImportTranslations {
  readonly ar?: string | undefined;
  readonly fr?: string | undefined;
  readonly en?: string | undefined;
}

export interface ValidatedMenuImportRow {
  readonly row: number;
  readonly externalKey: string;
  readonly categoryNames: ImportTranslations;
  readonly names: ImportTranslations;
  readonly descriptions: ImportTranslations;
  readonly priceDzd: number;
}

export interface MenuImportError {
  readonly row: number;
  readonly field: "external_key" | "category_ar";
  readonly reason: "archived_key" | "ambiguous_category" | "category_limit";
}

export interface MenuImportSummary {
  readonly categoriesCreated: number;
  readonly itemsCreated: number;
  readonly itemsUpdated: number;
  readonly itemsUnchanged: number;
}

export interface ImportCategory {
  readonly id: string | undefined;
  readonly names: ImportTranslations;
}

export interface PlannedImportItem {
  readonly row: ValidatedMenuImportRow;
  readonly category: ImportCategory;
  readonly id: string | undefined;
  readonly changed: boolean;
}

export interface MenuImportPlan {
  readonly categories: readonly ImportCategory[];
  readonly nextSort: number;
  readonly items: readonly PlannedImportItem[];
  readonly summary: MenuImportSummary;
  readonly errors: readonly MenuImportError[];
}
