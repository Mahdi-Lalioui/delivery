import { describe, expect, it } from "vitest";
import { buildInvoicePdf, type InvoicePdfInput } from "../src/invoice-pdf.ts";

const input: InvoicePdfInput = {
  number: "2027-000123",
  issuedOn: "2027-01-31",
  dueOn: "2027-02-07",
  periodStart: "2027-01-31",
  periodEnd: "2027-02-28",
  restaurantName: "Café fictif (démo)",
  subtotalDzd: 5000,
  taxRateBasisPoints: 0,
  taxDzd: 0,
  totalDzd: 5000,
  legal: {
    companyName: "Société fictive SARL",
    companyAddress: "1 rue fictive, Alger",
    registrationNumber: "RC-0000",
    taxId: null,
  },
};

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

describe("buildInvoicePdf", () => {
  it("[BIL-04] produces a PDF 1.4 document with the number, period and amount", () => {
    const text = latin1(buildInvoicePdf(input));
    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("(Facture 2027-000123)");
    expect(text).toContain("2027-01-31");
    expect(text).toContain("2027-02-28");
    expect(text).toContain("5 000 DZD");
    expect(text).toContain("Soci\\351t\\351 fictive SARL");
  });

  it("[BIL-04] writes a cross-reference table whose offsets point at each object", () => {
    const bytes = buildInvoicePdf(input);
    const text = latin1(bytes);
    const startXref = Number(/startxref\n(\d+)\n/.exec(text)?.[1]);
    expect(text.slice(startXref, startXref + 4)).toBe("xref");
    const offsets = [...text.slice(startXref).matchAll(/^(\d{10}) 00000 n $/gm)].map((match) =>
      Number(match[1]),
    );
    expect(offsets.length).toBeGreaterThanOrEqual(5);
    offsets.forEach((offset, index) => {
      expect(text.slice(offset, offset + 10)).toMatch(new RegExp(`^${String(index + 1)} 0 obj`));
    });
    const length = Number(/\/Length (\d+)/.exec(text)?.[1]);
    const streamStart = text.indexOf("stream\n") + "stream\n".length;
    expect(text.slice(streamStart + length, streamStart + length + 10)).toBe("\nendstream");
  });

  it("[BIL-04] escapes PDF string delimiters so names cannot break out of the text", () => {
    const text = latin1(buildInvoicePdf({ ...input, restaurantName: "A) Tj (B\\" }));
    expect(text).toContain("(Restaurant : A\\) Tj \\(B\\\\) Tj");
  });

  it("[BIL-04] shows the configured tax and legal fields", () => {
    const taxed = { ...input, taxRateBasisPoints: 1900, taxDzd: 950, totalDzd: 5950 };
    const text = latin1(buildInvoicePdf({ ...taxed, legal: { ...input.legal, taxId: "NIF-1" } }));
    expect(text).toContain("19 %");
    expect(text).toContain("950 DZD");
    expect(text).toContain("5 950 DZD");
    expect(text).toContain("NIF-1");
  });

  it("[BIL-04] refuses inconsistent amounts", () => {
    expect(() => buildInvoicePdf({ ...input, totalDzd: 4999 })).toThrow(RangeError);
  });

  it("[BIL-04] replaces characters outside the PDF standard font encoding", () => {
    const text = latin1(buildInvoicePdf({ ...input, restaurantName: "مطعم Test" }));
    expect(text).toContain("(Restaurant : ???? Test)");
  });
});
