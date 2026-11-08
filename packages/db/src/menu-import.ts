import type { TransactionSql } from "postgres";
import type { DatabaseConnection } from "./database.js";
import { readMenuContext, type MenuScope } from "./menu-access.js";
import { runMenuCommand, type CommandChange, type CommandRequest } from "./menu-commands.js";
import { readImportPlan } from "./menu-import-plan.js";
import type {
  MenuImportError,
  MenuImportSummary,
  ValidatedMenuImportRow,
} from "./menu-import-types.js";
import { writeImportPlan } from "./menu-import-writes.js";

export type {
  MenuImportError,
  MenuImportSummary,
  ValidatedMenuImportRow,
} from "./menu-import-types.js";

interface ImportInput {
  readonly expectedRevision: number;
  readonly rows: readonly ValidatedMenuImportRow[];
}

interface ImportPreview extends MenuScope, ImportInput {}

type PreviewResult =
  | {
      readonly kind: "previewed";
      readonly revision: number;
      readonly summary: MenuImportSummary;
      readonly errors: readonly MenuImportError[];
    }
  | { readonly kind: "not_found" | "revision_conflict" };

async function previewImport(sql: TransactionSql, request: ImportPreview): Promise<PreviewResult> {
  const menu = await readMenuContext(sql, request);
  if (!menu) return { kind: "not_found" };
  if (menu.revision !== request.expectedRevision) return { kind: "revision_conflict" };
  const { summary, errors } = await readImportPlan(sql, { ...request, lock: false });
  return { kind: "previewed", revision: menu.revision, summary, errors };
}

async function applyImport(
  sql: TransactionSql,
  request: CommandRequest<ImportInput>,
): Promise<
  | CommandChange<{ readonly summary: MenuImportSummary }, never>
  | { readonly kind: "import_conflict"; readonly errors: readonly MenuImportError[] }
> {
  const plan = await readImportPlan(sql, {
    merchantId: request.merchantId,
    rows: request.input.rows,
    lock: true,
  });
  if (plan.errors.length > 0) return { kind: "import_conflict", errors: plan.errors };
  await writeImportPlan(sql, request.merchantId, plan);
  return { kind: "changed", value: { summary: plan.summary } };
}

export function createMenuImportRepository({ sql }: DatabaseConnection) {
  return {
    preview: (request: ImportPreview) =>
      sql.begin("isolation level repeatable read read only", (tx) => previewImport(tx, request)),
    apply: (request: CommandRequest<ImportInput>) =>
      sql.begin((tx) =>
        runMenuCommand(tx, request, {
          operation: "menu_import",
          apply: () => applyImport(tx, request),
        }),
      ),
  };
}
