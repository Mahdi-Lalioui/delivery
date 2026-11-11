import { menuImportColumns } from "@zaafran/contracts/menu-import";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import {
  createMenuImportController,
  useMenuImport,
  type MenuImportOptions,
} from "../src/menu-import/use-menu-import";
import { parseMenuImportFile } from "../src/menu-import/import-file";
import type { MenuImportFileResult } from "../src/menu-import/import-file";

vi.mock("../src/menu-import/import-file", () => ({ parseMenuImportFile: vi.fn() }));

const parse = vi.mocked(parseMenuImportFile);
const merchantId = "019d6abc-1234-7234-8234-123456789000";
const sessionId = "019d6abc-1234-7234-8234-123456789001";
const otherSession = "019d6abc-1234-7234-8234-123456789002";
const rows = [
  {
    external_key: "meal-1",
    category_fr: "Plats",
    name_fr: "Grillade",
    description_fr: "Description",
    price_dzd: "500",
  },
];
const summary = { categoriesCreated: 1, itemsCreated: 1, itemsUpdated: 0, itemsUnchanged: 0 };
const preview = { sessionId, revision: 8, errors: [], summary, previewToken: "a".repeat(43) };
const receipt = { revision: 9, summary };
const file = new File([menuImportColumns.join(",")], "menu.csv");

function options(): MenuImportOptions {
  return {
    merchantId,
    snapshot: { sessionId, revision: 8 },
    blocked: false,
    onSaved: vi.fn().mockResolvedValue(undefined),
    onAccessChanged: vi.fn(),
    onReload: vi.fn(),
  };
}

function deferred<Value>() {
  const result = Promise.withResolvers<Value>();
  return result;
}

async function waitFor(controller: ReturnType<typeof createMenuImportController>, kind: string) {
  await vi.waitFor(() => {
    expect(controller.getSnapshot().state.kind).toBe(kind);
  });
}

afterEach(() => {
  parse.mockReset();
  vi.unstubAllGlobals();
});

test("[MER-12:hook] stays idle before an explicit file, preview and apply sequence", async () => {
  const props = options();
  const controller = createMenuImportController(props);
  const listener = vi.fn();
  const unsubscribe = controller.subscribe(listener);
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(preview))
    .mockResolvedValueOnce(Response.json(receipt, { status: 201 }));
  vi.stubGlobal("fetch", fetch);
  parse.mockResolvedValue({ kind: "parsed", rows });

  controller.apply();
  controller.preview();
  expect(fetch).not.toHaveBeenCalled();
  expect(parse).not.toHaveBeenCalled();
  controller.chooseFile(file);
  expect(controller.getSnapshot().pending).toBe(true);
  await waitFor(controller, "review");
  expect(controller.getSnapshot().fileName).toBe("menu.csv");
  expect(fetch).not.toHaveBeenCalled();
  controller.preview();
  await waitFor(controller, "previewed");
  expect(fetch).toHaveBeenCalledTimes(1);
  controller.apply();
  await waitFor(controller, "applied");
  expect(props.onSaved).toHaveBeenCalledExactlyOnceWith(9);
  expect(controller.getSnapshot().state).toEqual({ kind: "applied", result: receipt });
  expect(listener).toHaveBeenCalled();
  unsubscribe();
  controller.dispose();
});

test("[MER-12:hook] synchronous double submissions issue only one apply and reuse retries", async () => {
  const controller = createMenuImportController(options());
  parse.mockResolvedValue({ kind: "parsed", rows });
  const lost = deferred<Response>();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(preview))
    .mockImplementationOnce(() => lost.promise)
    .mockResolvedValueOnce(new Response(null, { status: 429 }))
    .mockResolvedValueOnce(Response.json(receipt, { status: 201 }));
  vi.stubGlobal("fetch", fetch);
  controller.chooseFile(file);
  await waitFor(controller, "review");
  controller.preview();
  controller.preview();
  await waitFor(controller, "previewed");
  controller.apply();
  controller.apply();
  expect(fetch).toHaveBeenCalledTimes(2);
  lost.reject(new TypeError("Lost committed response"));
  await waitFor(controller, "previewed");
  controller.preview();
  expect(fetch).toHaveBeenCalledTimes(2);
  controller.apply();
  await waitFor(controller, "previewed");
  controller.apply();
  await waitFor(controller, "applied");
  const writes = fetch.mock.calls.slice(1);
  expect(writes).toHaveLength(3);
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[2]).toEqual(writes[0]);
  controller.dispose();
});

test("[MER-12:hook] a later file discards a late parse and its preview token", async () => {
  const controller = createMenuImportController(options());
  const old = deferred<MenuImportFileResult>();
  parse.mockReturnValueOnce(old.promise).mockResolvedValueOnce({
    kind: "parsed",
    rows: [{ ...rows[0], external_key: "new-file" }],
  });
  controller.chooseFile(file);
  controller.chooseFile(new File(["header"], "replacement.csv"));
  await waitFor(controller, "review");
  old.resolve({ kind: "parsed", rows });
  await old.promise;
  expect(controller.getSnapshot()).toMatchObject({
    fileName: "replacement.csv",
    state: { kind: "review", draft: { input: { rows: [{ external_key: "new-file" }] } } },
  });
  controller.dispose();
});

test("[MER-12:hook] a file error clears the old rows and maps parser failures safely", async () => {
  const controller = createMenuImportController(options());
  parse
    .mockResolvedValueOnce({ kind: "parsed", rows })
    .mockResolvedValueOnce({ kind: "invalid_file", reason: "invalid_columns" })
    .mockRejectedValueOnce(new Error("Private parser internals"));
  controller.chooseFile(file);
  await waitFor(controller, "review");
  controller.chooseFile(new File(["bad"], "bad.csv"));
  await vi.waitFor(() => {
    expect(controller.getSnapshot().pending).toBe(false);
  });
  expect(controller.getSnapshot()).toMatchObject({
    state: { kind: "editing" },
    fileError: "invalid_columns",
  });
  controller.chooseFile(new File(["bad"], "bad.xlsx"));
  await vi.waitFor(() => {
    expect(controller.getSnapshot().pending).toBe(false);
  });
  expect(controller.getSnapshot()).toMatchObject({
    state: { kind: "editing" },
    fileError: "invalid_workbook",
  });
  controller.chooseFile(undefined);
  expect(controller.getSnapshot()).toMatchObject({
    state: { kind: "editing" },
    fileName: null,
    fileError: null,
  });
  controller.dispose();
});

test("[MER-12:hook] session changes cancel a pending preview and clear the file and rows", async () => {
  const props = options();
  const controller = createMenuImportController(props);
  const pending = deferred<Response>();
  const fetch = vi.fn<typeof globalThis.fetch>().mockReturnValue(pending.promise);
  vi.stubGlobal("fetch", fetch);
  parse.mockResolvedValue({ kind: "parsed", rows });
  controller.chooseFile(file);
  await waitFor(controller, "review");
  controller.preview();
  controller.updateOptions({ ...props, snapshot: { sessionId: otherSession, revision: 8 } });
  expect(controller.getSnapshot()).toMatchObject({
    pending: false,
    fileName: null,
    state: { kind: "editing", failure: "session-changed" },
  });
  const request = fetch.mock.calls[0]?.[1];
  expect(request?.signal?.aborted).toBe(true);
  pending.resolve(Response.json(preview));
  await pending.promise;
  expect(controller.getSnapshot().state).toEqual({ kind: "editing", failure: "session-changed" });
  controller.dispose();
});

test("[MER-12:hook] a session mismatch from the API clears private state and informs the workspace", async () => {
  const props = options();
  const controller = createMenuImportController(props);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ ...preview, sessionId: otherSession })),
  );
  parse.mockResolvedValue({ kind: "parsed", rows });
  controller.chooseFile(file);
  await waitFor(controller, "review");
  controller.preview();
  await waitFor(controller, "editing");
  expect(controller.getSnapshot()).toMatchObject({
    fileName: null,
    state: { failure: "session-changed" },
  });
  expect(props.onAccessChanged).toHaveBeenCalledExactlyOnceWith("session-changed");
  controller.dispose();
});

test("[MER-12:hook] blocks requests while another workspace mutation is active", async () => {
  const props = options();
  const controller = createMenuImportController({ ...props, blocked: true });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  controller.chooseFile(file);
  controller.preview();
  controller.apply();
  expect(parse).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  controller.updateOptions(props);
  parse.mockResolvedValue({ kind: "parsed", rows });
  controller.chooseFile(file);
  await waitFor(controller, "review");
  controller.updateOptions({ ...props, blocked: true });
  controller.preview();
  expect(fetch).not.toHaveBeenCalled();
  controller.dispose();
});

test("[MER-12:hook] observes account changes during success readback before exposing a receipt", async () => {
  const readback = deferred<undefined>();
  const props = { ...options(), onSaved: vi.fn().mockReturnValue(readback.promise) };
  const controller = createMenuImportController(props);
  parse.mockResolvedValue({ kind: "parsed", rows });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json(preview))
      .mockResolvedValueOnce(Response.json(receipt, { status: 201 })),
  );
  controller.chooseFile(file);
  await waitFor(controller, "review");
  controller.preview();
  await waitFor(controller, "previewed");
  controller.apply();
  await vi.waitFor(() => {
    expect(props.onSaved).toHaveBeenCalledWith(9);
  });
  controller.updateOptions({ ...props, snapshot: { sessionId: otherSession, revision: 9 } });
  readback.resolve(undefined);
  await readback.promise;
  expect(controller.getSnapshot()).toMatchObject({
    pending: false,
    fileName: null,
    state: { kind: "editing", failure: "session-changed" },
  });
  controller.dispose();
});

test("[MER-12:hook] a revision change invalidates a pending preview and keeps the selected rows", async () => {
  const props = options();
  const controller = createMenuImportController(props);
  const pending = deferred<Response>();
  const fetch = vi
    .fn()
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(Response.json({ ...preview, revision: 9 }));
  vi.stubGlobal("fetch", fetch);
  parse.mockResolvedValue({ kind: "parsed", rows });
  controller.chooseFile(file);
  await waitFor(controller, "review");
  controller.preview();
  controller.updateOptions({ ...props, snapshot: { sessionId, revision: 9 } });
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({ signal: { aborted: true } });
  expect(controller.getSnapshot()).toMatchObject({
    fileName: "menu.csv",
    pending: false,
    state: { kind: "review", draft: { input: { rows, expectedRevision: 9 } } },
  });
  controller.apply();
  expect(fetch).toHaveBeenCalledTimes(1);
  controller.preview();
  await waitFor(controller, "previewed");
  pending.resolve(Response.json(preview));
  await pending.promise;
  expect(controller.getSnapshot().state).toMatchObject({ preview: { revision: 9 } });
  controller.dispose();
});

test("[MER-12:hook] a successful readback may update the menu revision before publishing the receipt", async () => {
  const readback = deferred<undefined>();
  const props = { ...options(), onSaved: vi.fn().mockReturnValue(readback.promise) };
  const controller = createMenuImportController(props);
  parse.mockResolvedValue({ kind: "parsed", rows });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json(preview))
      .mockResolvedValueOnce(Response.json(receipt, { status: 201 })),
  );
  controller.chooseFile(file);
  await waitFor(controller, "review");
  controller.preview();
  await waitFor(controller, "previewed");
  controller.apply();
  await vi.waitFor(() => {
    expect(props.onSaved).toHaveBeenCalledWith(9);
  });
  controller.updateOptions({ ...props, snapshot: { sessionId, revision: 9 } });
  expect(controller.getSnapshot()).toMatchObject({ pending: true, state: { kind: "applying" } });
  readback.resolve(undefined);
  await waitFor(controller, "applied");
  expect(controller.getSnapshot()).toMatchObject({
    pending: false,
    state: { kind: "applied", result: receipt },
  });
  controller.dispose();
});

test("[MER-12:hook] retries a saved command with the same key when its readback fails", async () => {
  const props = {
    ...options(),
    onSaved: vi
      .fn()
      .mockRejectedValueOnce(new Error("Readback failed"))
      .mockResolvedValueOnce(undefined),
  };
  const controller = createMenuImportController(props);
  parse.mockResolvedValue({ kind: "parsed", rows });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(preview))
    .mockResolvedValueOnce(Response.json(receipt, { status: 201 }))
    .mockResolvedValueOnce(Response.json(receipt, { status: 201 }));
  vi.stubGlobal("fetch", fetch);
  controller.chooseFile(file);
  await waitFor(controller, "review");
  controller.preview();
  await waitFor(controller, "previewed");
  controller.apply();
  await waitFor(controller, "previewed");
  controller.apply();
  await waitFor(controller, "applied");
  expect(fetch.mock.calls[2]).toEqual(fetch.mock.calls[1]);
  controller.dispose();
});

test("[MER-12:hook] reload resets the file, and unmount prevents a delayed result from publishing", async () => {
  const props = options();
  const controller = createMenuImportController(props);
  const parsed = deferred<MenuImportFileResult>();
  parse.mockReturnValueOnce(parsed.promise);
  controller.chooseFile(file);
  controller.reload();
  expect(props.onReload).toHaveBeenCalledOnce();
  expect(controller.getSnapshot()).toMatchObject({ fileName: null, pending: false });
  controller.dispose();
  parsed.resolve({ kind: "parsed", rows });
  await parsed.promise;
  expect(controller.getSnapshot().state).toEqual({ kind: "editing" });
});

test("[MER-12:hook] the React binding renders idle server controls without parsing", () => {
  function Probe() {
    const controls = useMenuImport(options());
    return <output>{controls.state.kind}</output>;
  }
  expect(renderToStaticMarkup(<Probe />)).toBe("<output>editing</output>");
  expect(parse).not.toHaveBeenCalled();
});
