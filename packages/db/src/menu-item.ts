import type { DatabaseConnection } from "./database.js";
import { runMenuCommand } from "./menu-commands.js";
import { listItems, type ItemPage } from "./menu-item-queries.js";
import {
  archiveItem,
  createItem,
  duplicateItem,
  setItemAvailability,
  updateItem,
  type ItemAvailabilityWrite,
  type ItemRevision,
  type ItemUpdate,
  type ItemWrite,
} from "./menu-item-writes.js";

export function createMenuItemRepository({ sql }: DatabaseConnection) {
  return {
    list: (request: ItemPage) =>
      sql.begin("isolation level repeatable read read only", (tx) => listItems(tx, request)),
    create: (request: ItemWrite) =>
      sql.begin((tx) =>
        runMenuCommand(tx, request, {
          operation: "item_create",
          apply: () => createItem(tx, request),
        }),
      ),
    update: (request: ItemUpdate) =>
      sql.begin((tx) =>
        runMenuCommand(tx, request, {
          operation: "item_update",
          apply: () => updateItem(tx, request),
        }),
      ),
    duplicate: (request: ItemRevision) =>
      sql.begin((tx) =>
        runMenuCommand(tx, request, {
          operation: "item_duplicate",
          apply: () => duplicateItem(tx, request),
        }),
      ),
    archive: (request: ItemRevision) =>
      sql.begin((tx) =>
        runMenuCommand(tx, request, {
          operation: "item_archive",
          apply: () => archiveItem(tx, request),
        }),
      ),
    setAvailability: (request: ItemAvailabilityWrite) =>
      sql.begin((tx) =>
        runMenuCommand(tx, request, {
          operation: "item_availability",
          apply: () => setItemAvailability(tx, request),
        }),
      ),
  };
}
