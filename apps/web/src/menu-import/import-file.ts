import { menuImportColumns, type menuImportInput } from "@zaafran/contracts/menu-import";
import type { Entry, FileEntry } from "@zip.js/zip.js";

type Rows = ReturnType<typeof menuImportInput.parse>["rows"];
export type MenuImportFileError =
  | "unsupported_format"
  | "file_too_large"
  | "invalid_csv"
  | "invalid_workbook"
  | "unsafe_workbook"
  | "workbook_too_large"
  | "invalid_columns"
  | "too_many_rows"
  | "cell_too_long"
  | "payload_too_large"
  | "empty_file";
export type MenuImportFileResult =
  { kind: "parsed"; rows: Rows } | { kind: "invalid_file"; reason: MenuImportFileError };

const maximumFileBytes = 1024 * 1024;
const maximumExpandedBytes = 8 * 1024 * 1024;
const maximumJsonBytes = 256 * 1024;

class ParseFailure extends Error {
  constructor(readonly reason: MenuImportFileError) {
    super(reason);
  }
}

function reject(reason: MenuImportFileError): never {
  throw new ParseFailure(reason);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function readRows(table: unknown): Rows {
  if (!isArray(table) || table.length < 2) reject("empty_file");
  if (table.length > 501) reject("too_many_rows");
  const [header, ...data] = table;
  if (
    !isArray(header) ||
    header.length !== menuImportColumns.length ||
    !menuImportColumns.every((name, index) => header[index] === name)
  )
    reject("invalid_columns");

  return data.map((cells: unknown) => {
    if (!isArray(cells) || cells.length > 10) reject("invalid_columns");
    const row: Rows[number] = {};
    for (const [index, field] of menuImportColumns.entries()) {
      const value: unknown = cells[index] ?? "";
      if (typeof value !== "string") reject("invalid_workbook");
      if (value.length > 2000) reject("cell_too_long");
      row[field] = value;
    }
    return row;
  });
}

function checkPayload(rows: Rows): void {
  // Reserve the larger apply envelope, including its token and maximum safe revision.
  const body = { rows, expectedRevision: Number.MAX_SAFE_INTEGER, previewToken: "A".repeat(43) };
  if (new TextEncoder().encode(JSON.stringify(body)).length > maximumJsonBytes) {
    reject("payload_too_large");
  }
}

async function readCsv(bytes: ArrayBuffer): Promise<unknown> {
  const { parse } = await import("csv-parse/browser/esm/sync");
  let records = 0;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const table: unknown = parse(text, {
      bom: true,
      cast: false,
      trim: false,
      skip_empty_lines: false,
      relax_column_count: true,
      max_record_size: 24_000,
      on_record(record: string[]) {
        records += 1;
        if (records > 501) reject("too_many_rows");
        return record;
      },
    });
    return table;
  } catch (error) {
    if (error instanceof ParseFailure) throw error;
    return reject("invalid_csv");
  }
}

function coordinate(value: string): void {
  const match = /^([A-J])([1-9][0-9]{0,2})$/u.exec(value);
  if (!match || Number(match[2]) > 501) reject("unsafe_workbook");
}

function inspectCoordinates(
  local: string | undefined,
  attributes: Record<string, string>,
  cells: Set<string>,
): void {
  const value = (field: string) => attributes[field] ?? "";
  const reference = value("r");
  if (local === "row" && !/^(?:[1-9]|[1-9][0-9]|[1-4][0-9]{2}|50[01])$/u.test(reference)) {
    reject("unsafe_workbook");
  }
  if (local === "dimension") value("ref").split(":").forEach(coordinate);
  if (local === "col" && (!/^[1-9][0-9]*$/u.test(value("max")) || Number(value("max")) > 10)) {
    reject("unsafe_workbook");
  }
  if (local !== "c") return;
  coordinate(reference);
  if (cells.has(reference)) reject("unsafe_workbook");
  cells.add(reference);
}

function inspectElement(
  name: string,
  attributes: Record<string, string>,
  cells: Set<string>,
): void {
  const local = name.split(":").at(-1);
  const value = (field: string) => attributes[field] ?? "";
  if (local === "f") reject("unsafe_workbook");
  inspectCoordinates(local, attributes, cells);
  const external =
    value("TargetMode").toLowerCase() === "external" ||
    /^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu.test(value("Target")) ||
    /\/externalLink/iu.test(value("Type"));
  if (local === "Relationship" && external) reject("unsafe_workbook");
  if (/macroEnabled|vbaProject|oleObject/iu.test(value("ContentType"))) {
    reject("unsafe_workbook");
  }
}

async function inspectXml(xml: string): Promise<void> {
  if (/&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-f]+);)/iu.test(xml)) {
    reject("unsafe_workbook");
  }
  const { Parser } = await import("saxen");
  const parser = new Parser();
  const cells = new Set<string>();
  parser.on("openTag", (name, attributes, decodeEntities) => {
    const decoded = Object.fromEntries(
      Object.entries(attributes()).map(([key, value]) => [key, decodeEntities(value)]),
    );
    inspectElement(name, decoded, cells);
  });
  parser.on("attention", () => reject("unsafe_workbook"));
  parser.on("question", (value) => {
    if (!/^xml(?:\s|$)/u.test(value)) reject("unsafe_workbook");
  });
  parser.on("error", () => reject("invalid_workbook"));
  parser.on("warn", () => reject("invalid_workbook"));
  parser.parse(xml);
}

function checkEntryName(name: string, names: Set<string>): void {
  if (names.has(name) || !/^[A-Za-z0-9_./[\] -]+$/u.test(name) || name.startsWith("/")) {
    reject("unsafe_workbook");
  }
  if (name.split("/").some((part) => part === ".." || part === ".")) reject("unsafe_workbook");
  if (/vba|\.bin$|externalLinks\//iu.test(name)) reject("unsafe_workbook");
  names.add(name);
}

function checkEntryMetadata(entry: Entry): void {
  if (entry.encrypted) reject("unsafe_workbook");
  // Both archive readers must see the same ASCII name when deciding whether to parse XML.
  if (
    entry.rawFilename.length !== entry.filename.length ||
    entry.rawFilename.some((byte, index) => byte !== entry.filename.charCodeAt(index))
  ) {
    reject("unsafe_workbook");
  }
  // Skip only empty directory records that the spreadsheet reader also sees as directories.
  if (
    entry.directory &&
    (!entry.filename.endsWith("/") || entry.compressedSize !== 0 || entry.uncompressedSize !== 0)
  ) {
    reject("unsafe_workbook");
  }
}

function checkEntries(entries: readonly Entry[]): void {
  if (entries.length > 32) reject("workbook_too_large");
  const names = new Set<string>();
  let declaredBytes = 0;
  for (const entry of entries) {
    checkEntryName(entry.filename, names);
    checkEntryMetadata(entry);
    declaredBytes += entry.uncompressedSize;
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > maximumExpandedBytes) {
      reject("workbook_too_large");
    }
  }
  if (!names.has("[Content_Types].xml") || !names.has("xl/workbook.xml")) {
    reject("invalid_workbook");
  }
  const worksheets = [...names].filter((name) => /^xl\/worksheets\/[^/]+\.xml$/u.test(name));
  if (worksheets.length !== 1) reject("invalid_workbook");
}

async function inspectEntry(entry: FileEntry, budget: { bytes: number }): Promise<void> {
  const isXml = /\.(?:xml|rels)$/u.test(entry.filename);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const text: string[] = [];
  await entry.getData(
    new WritableStream<Uint8Array>({
      write(chunk) {
        budget.bytes += chunk.byteLength;
        if (budget.bytes > maximumExpandedBytes) reject("workbook_too_large");
        if (isXml) text.push(decoder.decode(chunk, { stream: true }));
      },
    }),
  );
  if (isXml) await inspectXml(text.join("") + decoder.decode());
}

async function preflightWorkbook(bytes: ArrayBuffer): Promise<void> {
  const { ZipReader, Uint8ArrayReader, ERR_INVALID_UNCOMPRESSED_SIZE } =
    await import("@zip.js/zip.js");
  const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(bytes)), {
    strictness: "strict",
    checkCrc32: true,
    checkOverlappingEntry: true,
    useWebWorkers: false,
  });
  try {
    const entries = await reader.getEntries();
    checkEntries(entries);
    const budget = { bytes: 0 };
    for (const entry of entries) {
      if (!entry.directory) await inspectEntry(entry, budget);
    }
  } catch (error) {
    if (error instanceof Error && error.message === ERR_INVALID_UNCOMPRESSED_SIZE) {
      reject("workbook_too_large");
    }
    throw error;
  } finally {
    await reader.close();
  }
}

async function readWorkbook(bytes: ArrayBuffer): Promise<unknown> {
  try {
    await preflightWorkbook(bytes);
    const { readSheet } = await import("read-excel-file/browser");
    return await readSheet(bytes, { trim: false, parseNumber: (value) => value });
  } catch (error) {
    if (error instanceof ParseFailure) throw error;
    return reject("invalid_workbook");
  }
}

export async function parseMenuImportFile(file: File): Promise<MenuImportFileResult> {
  const extension = file.name.toLowerCase().split(".").at(-1);
  if (extension !== "csv" && extension !== "xlsx") {
    return { kind: "invalid_file", reason: "unsupported_format" };
  }
  try {
    if (file.size > maximumFileBytes) reject("file_too_large");
    if (file.size === 0) reject("empty_file");
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > maximumFileBytes) reject("file_too_large");
    const table = extension === "csv" ? await readCsv(bytes) : await readWorkbook(bytes);
    const rows = readRows(table);
    checkPayload(rows);
    return { kind: "parsed", rows };
  } catch (error) {
    const fallback = extension === "csv" ? "invalid_csv" : "invalid_workbook";
    return {
      kind: "invalid_file",
      reason: error instanceof ParseFailure ? error.reason : fallback,
    };
  }
}
