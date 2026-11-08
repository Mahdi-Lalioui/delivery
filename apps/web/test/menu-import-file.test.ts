import { crc32 } from "node:zlib";
import {
  TextReader,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
} from "@zip.js/zip.js";
import { menuImportColumns } from "@zaafran/contracts/menu-import";
import { expect, test } from "vitest";
import { parseMenuImportFile } from "../src/menu-import/import-file.js";

const header = menuImportColumns.join(",");
const values = [
  "meal-001",
  "",
  "Plats fictifs",
  "",
  "Plat fictif",
  "",
  "",
  "Description fictive",
  "",
  "٤٥٠",
];
const csv = (text: string, name = "menu.csv") => new File([text], name);
const escapeXml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");

function sheetRow(row: number, cells: readonly string[]) {
  return `<row r="${String(row)}">${cells
    .map(
      (cell, column) =>
        `<c r="${String.fromCharCode(65 + column)}${String(row)}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`,
    )
    .join("")}</row>`;
}

const contentTypes =
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
const workbookXml =
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Menu" sheetId="1" r:id="rId1"/></sheets></workbook>';
const relationships =
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';
const worksheet = (content = sheetRow(1, menuImportColumns) + sheetRow(2, values)) =>
  `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${content}</sheetData></worksheet>`;

async function zip(entries: Record<string, string>, level = 0) {
  const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
  const lastModDate = new Date("2026-11-08T15:02:00Z");
  for (const [name, xml] of Object.entries(entries)) {
    await writer.add(name, new TextReader(xml), { level, lastModDate });
  }
  const bytes = await writer.close();
  return bytes;
}

async function workbook(replacements: Record<string, string> = {}, level = 0) {
  return zip(
    {
      "[Content_Types].xml": contentTypes,
      "xl/workbook.xml": workbookXml,
      "xl/_rels/workbook.xml.rels": relationships,
      "xl/worksheets/sheet1.xml": worksheet(),
      ...replacements,
    },
    level,
  );
}

async function xlsx(replacements: Record<string, string> = {}, level = 0) {
  const bytes = await workbook(replacements, level);
  return new File([new Uint8Array(bytes)], "menu.xlsx");
}

test("[MER-12:file] rejects a worksheet file whose metadata marks it as a directory", async () => {
  const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
  await writer.add("[Content_Types].xml", new TextReader(contentTypes));
  await writer.add("xl/workbook.xml", new TextReader(workbookXml));
  await writer.add("xl/_rels/workbook.xml.rels", new TextReader(relationships));
  await writer.add("xl/worksheets/sheet1.xml", new TextReader(worksheet()), {
    externalFileAttributes: 0o040000 << 16,
  });
  const file = new File([new Uint8Array(await writer.close())], "menu.xlsx");
  await expect(parseMenuImportFile(file)).resolves.toEqual({
    kind: "invalid_file",
    reason: "unsafe_workbook",
  });
});

test("[MER-12:file] rejects archives that give a worksheet two different names", async () => {
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    useWebWorkers: false,
    useUnicodeFileNames: false,
  });
  await writer.add("[Content_Types].xml", new TextReader(contentTypes));
  await writer.add("xl/workbook.xml", new TextReader(workbookXml));
  await writer.add("xl/_rels/workbook.xml.rels", new TextReader(relationships));
  const original = "xl/worksheets/sheet1.xml";
  const alternative = new TextEncoder().encode("xl/worksheets/another-name.xml");
  const unicodePath = new Uint8Array(5 + alternative.length);
  unicodePath[0] = 1;
  new DataView(unicodePath.buffer).setUint32(1, crc32(original), true);
  unicodePath.set(alternative, 5);
  await writer.add(original, new TextReader(worksheet()), {
    extraField: new Map([[0x7075, unicodePath]]),
  });
  const file = new File([new Uint8Array(await writer.close())], "menu.xlsx");
  await expect(parseMenuImportFile(file)).resolves.toEqual({
    kind: "invalid_file",
    reason: "unsafe_workbook",
  });
});

test("[MER-12:file] preserves CSV BOM, raw strings, quoted multiline text and blank sheet rows", async () => {
  const text = `\ufeff${header}\r\n${values.join(",")}\r\n\r\n${values.map((cell, i) => (i === 7 ? '"  Line one\nLine two, still description  "' : cell)).join(",")}\r\n`;
  expect(await parseMenuImportFile(csv(text))).toEqual({
    kind: "parsed",
    rows: [
      Object.fromEntries(menuImportColumns.map((column, i) => [column, values[i]])),
      Object.fromEntries(menuImportColumns.map((column) => [column, ""])),
      {
        ...Object.fromEntries(menuImportColumns.map((column, i) => [column, values[i]])),
        description_fr: "  Line one\nLine two, still description  ",
      },
    ],
  });
});

test("[MER-12:file] rejects unsupported, oversized and malformed text files", async () => {
  expect(await parseMenuImportFile(csv("x", "menu.xls"))).toEqual({
    kind: "invalid_file",
    reason: "unsupported_format",
  });
  expect(await parseMenuImportFile(csv("x".repeat(1024 * 1024 + 1)))).toEqual({
    kind: "invalid_file",
    reason: "file_too_large",
  });
  expect(await parseMenuImportFile(csv(`${header}\n"unterminated`))).toEqual({
    kind: "invalid_file",
    reason: "invalid_csv",
  });
  expect(await parseMenuImportFile(csv(""))).toEqual({
    kind: "invalid_file",
    reason: "empty_file",
  });
  expect(await parseMenuImportFile(new File([new Uint8Array([0xff, 0xfe])], "menu.csv"))).toEqual({
    kind: "invalid_file",
    reason: "invalid_csv",
  });
});

test("[MER-12:file] requires the exact ordered columns and at most 500 data rows", async () => {
  for (const text of [
    header.replace("external_key", "externalKey") + "\n" + values.join(","),
    menuImportColumns.toReversed().join(",") + "\n" + values.join(","),
    header + "\n" + [...values, "extra"].join(","),
  ]) {
    expect(await parseMenuImportFile(csv(text))).toEqual({
      kind: "invalid_file",
      reason: "invalid_columns",
    });
  }
  expect(
    await parseMenuImportFile(
      csv(header + "\n" + Array.from({ length: 500 }, () => values.join(",")).join("\n")),
    ),
  ).toMatchObject({ kind: "parsed" });
  expect(
    await parseMenuImportFile(
      csv(header + "\n" + Array.from({ length: 501 }, () => values.join(",")).join("\n")),
    ),
  ).toEqual({ kind: "invalid_file", reason: "too_many_rows" });
});

test("[MER-12:file] bounds raw cells and encoded request bytes including Unicode", async () => {
  const long = [...values];
  long[7] = "x".repeat(2001);
  expect(await parseMenuImportFile(csv(header + "\n" + long.join(",")))).toEqual({
    kind: "invalid_file",
    reason: "cell_too_long",
  });
  long[7] = "ب".repeat(1000);
  const many = Array.from({ length: 150 }, () => long.join(",")).join("\n");
  expect(await parseMenuImportFile(csv(header + "\n" + many))).toEqual({
    kind: "invalid_file",
    reason: "payload_too_large",
  });
});

test("[MER-12:file] preserves XLSX missing row positions and exact numeric lexemes", async () => {
  const numeric =
    '<row r="4"><c r="A4" t="inlineStr"><is><t> 00012 </t></is></c><c r="J4"><v>12345678901234567890</v></c></row>';
  const result = await parseMenuImportFile(
    await xlsx({
      "xl/worksheets/sheet1.xml": worksheet(
        sheetRow(1, menuImportColumns) + sheetRow(2, values) + numeric,
      ),
    }),
  );
  expect(result).toMatchObject({
    kind: "parsed",
    rows: [
      { external_key: "meal-001", price_dzd: "٤٥٠" },
      { external_key: "", price_dzd: "" },
      { external_key: " 00012 ", price_dzd: "12345678901234567890" },
    ],
  });
});

test.each([
  '<row r="2"><c r="J2"><f>1+2</f><v>3</v></c></row>',
  '<row r="502"><c r="A502" t="inlineStr"><is><t>outside</t></is></c></row>',
  '<row r="2"><c r="K2" t="inlineStr"><is><t>outside</t></is></c></row>',
  '<row r="2"><c r="A2" t="inlineStr"><is><t>one</t></is></c><c r="A2" t="inlineStr"><is><t>duplicate</t></is></c></row>',
])("[MER-12:file] rejects unsafe XLSX coordinates or formulas before reading", async (body) => {
  expect(
    await parseMenuImportFile(
      await xlsx({
        "xl/worksheets/sheet1.xml": worksheet(sheetRow(1, menuImportColumns) + body),
      }),
    ),
  ).toEqual({ kind: "invalid_file", reason: "unsafe_workbook" });
});

test("[MER-12:file] rejects macros, external links, XML declarations and malformed XML", async () => {
  for (const entries of [
    { "xl/vbaProject.bin": "synthetic macro" },
    {
      "[Content_Types].xml": contentTypes.replace(
        "spreadsheetml.sheet.main",
        "ms-excel.sheet.macroEnabled.main",
      ),
    },
    {
      "xl/_rels/workbook.xml.rels": relationships.replace(
        'Target="worksheets/sheet1.xml"',
        'TargetMode="External" Target="https://example.invalid/sheet.xml"',
      ),
    },
    { "docProps/custom.xml": '<!DOCTYPE root [<!ENTITY bad "expanded">]><root>&bad;</root>' },
    { "docProps/custom.xml": "<root>&unknown;</root>" },
  ]) {
    expect(await parseMenuImportFile(await xlsx(entries))).toEqual({
      kind: "invalid_file",
      reason: "unsafe_workbook",
    });
  }
  expect(
    await parseMenuImportFile(await xlsx({ "docProps/custom.xml": "<root><child></root>" })),
  ).toEqual({ kind: "invalid_file", reason: "invalid_workbook" });
});

test("[MER-12:file] rejects truncated, corrupt-CRC and overlapping ZIP archives", async () => {
  const bytes = await workbook();
  expect(
    await parseMenuImportFile(new File([bytes.subarray(0, bytes.length - 22)], "menu.xlsx")),
  ).toEqual({ kind: "invalid_file", reason: "invalid_workbook" });
  // XML whitespace remains valid, so this case depends on the CRC check.
  const validWhitespace = contentTypes.replace("<Types ", "<Types\t");
  expect(
    await parseMenuImportFile(await xlsx({ "[Content_Types].xml": validWhitespace })),
  ).toMatchObject({ kind: "parsed" });
  const corrupt = Buffer.from(bytes);
  const position = corrupt.indexOf("<Types ");
  expect(position).toBeGreaterThanOrEqual(0);
  corrupt[position + "<Types".length] = 9;
  expect(await parseMenuImportFile(new File([corrupt], "menu.xlsx"))).toEqual({
    kind: "invalid_file",
    reason: "invalid_workbook",
  });

  const overlap = new Uint8Array(bytes);
  const view = new DataView(overlap.buffer);
  const centralOffsets: number[] = [];
  for (let i = 0; i < bytes.length - 46; i += 1) {
    if (view.getUint32(i, true) === 0x02014b50) centralOffsets.push(i);
  }
  const [first, second] = centralOffsets;
  if (first === undefined || second === undefined) throw new Error("Expected two entries.");
  view.setUint32(second + 42, view.getUint32(first + 42, true), true);
  expect(await parseMenuImportFile(new File([overlap], "menu.xlsx"))).toEqual({
    kind: "invalid_file",
    reason: "invalid_workbook",
  });
});

test("[MER-12:file] bounds ZIP entries and declared decompressed bytes", async () => {
  const entries = Object.fromEntries(
    Array.from({ length: 30 }, (_, i) => [`docProps/p${String(i)}.xml`, "<root/>"]),
  );
  expect(await parseMenuImportFile(await xlsx(entries))).toEqual({
    kind: "invalid_file",
    reason: "workbook_too_large",
  });
  expect(
    await parseMenuImportFile(
      await xlsx({ "docProps/bomb.xml": "<root>" + " ".repeat(8 * 1024 * 1024) + "</root>" }, 9),
    ),
  ).toEqual({ kind: "invalid_file", reason: "workbook_too_large" });
});

test("[MER-12:file] checks actual inflation even when the central size lies", async () => {
  const bytes = await workbook(
    { "docProps/bomb.xml": "<root>" + " ".repeat(9 * 1024 * 1024) + "</root>" },
    9,
  );
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const reader = new ZipReader(new Uint8ArrayReader(bytes), { useWebWorkers: false });
  const entries = await reader.getEntries();
  const bomb = entries.find(({ filename }) => filename === "docProps/bomb.xml");
  if (!bomb) throw new Error("Expected bomb fixture.");
  await reader.close();
  for (let i = 0; i < bytes.length - 46; i += 1) {
    if (view.getUint32(i, true) === 0x02014b50 && view.getUint32(i + 24, true) > 8 * 1024 * 1024)
      view.setUint32(i + 24, 1, true);
    if (view.getUint32(i, true) === 0x08074b50 && view.getUint32(i + 12, true) > 8 * 1024 * 1024)
      view.setUint32(i + 12, 1, true);
    if (view.getUint32(i, true) === 0x04034b50 && view.getUint32(i + 22, true) > 8 * 1024 * 1024)
      view.setUint32(i + 22, 1, true);
  }
  expect(await parseMenuImportFile(new File([new Uint8Array(bytes)], "menu.xlsx"))).toEqual({
    kind: "invalid_file",
    reason: "workbook_too_large",
  });
});
