import type { DatabaseConnection } from "./database.js";
import { runMenuCommand } from "./menu-commands.js";
import {
  getOptionGroupDetail,
  listOptionGroups,
  type OptionGroupDetailScope,
  type OptionGroupPage,
} from "./menu-option-group-queries.js";
import {
  createOptionGroup,
  updateOptionGroup,
  type GroupCreate,
  type GroupUpdate,
} from "./menu-option-group-writes.js";

export function createMenuOptionGroupRepository({ sql }: DatabaseConnection) {
  return {
    list: (request: OptionGroupPage) =>
      sql.begin("isolation level repeatable read read only", (tx) => listOptionGroups(tx, request)),
    detail: (request: OptionGroupDetailScope) =>
      sql.begin("isolation level repeatable read read only", (tx) =>
        getOptionGroupDetail(tx, request),
      ),
    create: (request: GroupCreate) =>
      sql.begin((tx) =>
        runMenuCommand(tx, request, {
          operation: "option_group_create",
          apply: () => createOptionGroup(tx, request),
        }),
      ),
    update: (request: GroupUpdate) =>
      sql.begin((tx) =>
        runMenuCommand(tx, request, {
          operation: "option_group_update",
          apply: () => updateOptionGroup(tx, request),
        }),
      ),
  };
}
