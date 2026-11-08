import { getLocalizedContent } from "@zaafran/i18n/content";
import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
  itemAttachmentLimit,
  type ItemAttachmentAction,
  type ItemAttachments,
} from "../item-attachments";

type Ready = Extract<ItemAttachments, { kind: "ready" }>;
type NamedGroup = { id: string; name: string };
type Update = (action: ItemAttachmentAction) => void;

const pickerId = "menu-item-option-group-select";

function attachedId(groupId: string): string {
  return `menu-item-option-group-${groupId}`;
}

function AttachedGroups({ groups, update }: { groups: NamedGroup[]; update: Update }) {
  const translate = useTranslations("menuItem");
  if (groups.length === 0)
    return <p className="menu-item-hint">{translate("optionGroupsNotAttached")}</p>;

  return (
    <ol
      className="menu-item-attachments"
      role="list"
      aria-label={translate("optionGroupsSelected")}
    >
      {groups.map(({ id, name }, index) => (
        <li key={id} id={attachedId(id)} tabIndex={-1}>
          <div className="menu-item-attachment-row">
            <bdi>{name}</bdi>
            <div className="menu-item-actions">
              <button
                type="button"
                className="menu-item-secondary"
                disabled={index === 0}
                onClick={() => {
                  update({ kind: "earlier", groupId: id });
                }}
              >
                {translate("optionGroupsEarlier", { name })}
              </button>
              <button
                type="button"
                className="menu-item-secondary"
                disabled={index === groups.length - 1}
                onClick={() => {
                  update({ kind: "later", groupId: id });
                }}
              >
                {translate("optionGroupsLater", { name })}
              </button>
              <button
                type="button"
                className="menu-item-secondary"
                onClick={() => {
                  update({ kind: "remove", groupId: id });
                }}
              >
                {translate("optionGroupsRemove", { name })}
              </button>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function AttachmentPicker({ groups, update }: { groups: NamedGroup[]; update: Update }) {
  const translate = useTranslations("menuItem");
  const [chosen, setChosen] = useState("");
  const selection = groups.some(({ id }) => id === chosen) ? chosen : "";
  if (groups.length === 0) return null;

  return (
    <div className="menu-item-field">
      <label htmlFor={pickerId}>{translate("optionGroupsAvailable")}</label>
      <select
        id={pickerId}
        className="menu-item-select"
        value={selection}
        onChange={(event) => {
          setChosen(event.currentTarget.value);
        }}
      >
        <option value="">{translate("optionGroupsChoose")}</option>
        {groups.map(({ id, name }) => (
          <option key={id} value={id} dir="auto">
            {name}
          </option>
        ))}
      </select>
      <div className="menu-item-actions">
        <button
          type="button"
          className="menu-item-secondary"
          disabled={!selection}
          onClick={() => {
            update({ kind: "attach", groupId: selection });
            setChosen("");
          }}
        >
          {translate("optionGroupsAdd")}
        </button>
      </div>
    </div>
  );
}

function ReadyAttachments({
  ids,
  optionGroups,
  locale,
  update,
}: {
  ids: string[];
  optionGroups: Ready["optionGroups"];
  locale: Locale;
  update: Update;
}) {
  const translate = useTranslations("menuItem");
  const scope = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<{ id: string } | undefined>();
  const unknownName = translate("optionGroupUnknown");
  const choices = optionGroups.map(({ optionGroupId, names }) => ({
    id: optionGroupId,
    name: getLocalizedContent(names, locale) ?? unknownName,
  }));
  const labels = new Map(choices.map(({ id, name }) => [id, name]));
  const selected = ids.map((id) => ({ id, name: labels.get(id) ?? unknownName }));
  const available = choices.filter(({ id }) => !ids.includes(id));
  const isFull = ids.length >= itemAttachmentLimit;

  useEffect(() => {
    if (!focus || !scope.current) return;
    const target = scope.current.querySelector<HTMLElement>(`#${focus.id}`);
    (target ?? scope.current.closest("fieldset"))?.focus();
  }, [focus]);

  function edit(action: ItemAttachmentAction) {
    setFocus({ id: action.kind === "remove" ? pickerId : attachedId(action.groupId) });
    update(action);
  }

  return (
    <div className="menu-item-fields" ref={scope}>
      <AttachedGroups groups={selected} update={edit} />
      {choices.length === 0 && <p className="menu-item-hint">{translate("optionGroupsNone")}</p>}
      {isFull ? (
        <p className="menu-item-hint">{translate("optionGroupsLimit")}</p>
      ) : (
        <AttachmentPicker groups={available} update={edit} />
      )}
    </div>
  );
}

export function ItemAttachmentFields({
  attachments,
  ids,
  locale,
  pending,
  update,
  retryAttachments,
  reload,
}: {
  attachments: ItemAttachments;
  ids: string[];
  locale: Locale;
  pending: boolean;
  update: Update;
  retryAttachments: () => void;
  reload: () => void;
}) {
  const translate = useTranslations("menuItem");

  return (
    <fieldset className="menu-item-fields" disabled={pending} tabIndex={-1}>
      <legend>{translate("optionGroups")}</legend>
      {attachments.kind === "loading" && <p role="status">{translate("optionGroupsLoading")}</p>}
      {attachments.kind === "error" && (
        <div className="menu-item-fields">
          <p className="menu-item-error" role="alert">
            {translate("optionGroupsLoadError")}
          </p>
          <div className="menu-item-actions">
            <button type="button" className="menu-item-secondary" onClick={retryAttachments}>
              {translate("optionGroupsRetry")}
            </button>
          </div>
        </div>
      )}
      {attachments.kind === "revision-conflict" && (
        <div className="menu-item-fields">
          <p className="menu-item-error" role="alert">
            {translate("revisionConflict")}
          </p>
          <div className="menu-item-actions">
            <button type="button" className="menu-item-secondary" onClick={reload}>
              {translate("reload")}
            </button>
          </div>
        </div>
      )}
      {attachments.kind === "ready" && (
        <ReadyAttachments
          ids={ids}
          optionGroups={attachments.optionGroups}
          locale={locale}
          update={update}
        />
      )}
    </fieldset>
  );
}
