// BIL-04 invoice PDF. A dependency-free PDF 1.4 writer: one A4 page, Helvetica with
// WinAnsiEncoding, French labels. Pure: same input → same bytes.

export type InvoicePdfInput = {
  readonly number: string;
  readonly issuedOn: string;
  readonly dueOn: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly restaurantName: string;
  readonly subtotalDzd: number;
  readonly taxRateBasisPoints: number;
  readonly taxDzd: number;
  readonly totalDzd: number;
  readonly legal: {
    readonly companyName: string;
    readonly companyAddress: string;
    readonly registrationNumber: string | null;
    readonly taxId: string | null;
  };
};

type Line = { readonly text: string; readonly size: number; readonly gapAfter?: number };

const pageWidth = 595;
const pageHeight = 842;
const margin = 56;

/** Encodes one character for a PDF literal string in WinAnsi (Latin-1 range only). */
function encodeChar(char: string): string {
  if (char === "(" || char === ")" || char === "\\") return `\\${char}`;
  if (char === "’") return "'";
  const code = char.codePointAt(0) ?? 63;
  if (code >= 0x20 && code < 0x7f) return char;
  if (code >= 0xa0 && code <= 0xff) return `\\${code.toString(8)}`;
  return "?";
}

function pdfString(text: string): string {
  return `(${Array.from(text, encodeChar).join("")})`;
}

function formatDzd(amountDzd: number): string {
  return `${String(amountDzd).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} DZD`;
}

function formatRate(basisPoints: number): string {
  const percent = (basisPoints / 100)
    .toFixed(2)
    .replace(/\.?0+$/, "")
    .replace(".", ",");
  return `${percent} %`;
}

function invoiceLines(input: InvoicePdfInput): Line[] {
  const { legal } = input;
  const lines: Line[] = [
    { text: legal.companyName, size: 14 },
    { text: legal.companyAddress, size: 10 },
  ];
  if (legal.registrationNumber !== null)
    lines.push({ text: `RC : ${legal.registrationNumber}`, size: 10 });
  if (legal.taxId !== null) lines.push({ text: `NIF : ${legal.taxId}`, size: 10 });
  return [
    ...lines,
    { text: "", size: 10, gapAfter: 16 },
    { text: `Facture ${input.number}`, size: 20, gapAfter: 12 },
    { text: `Date d’émission : ${input.issuedOn}`, size: 11 },
    { text: `Échéance : ${input.dueOn}`, size: 11 },
    { text: `Restaurant : ${input.restaurantName}`, size: 11 },
    { text: `Période : du ${input.periodStart} au ${input.periodEnd}`, size: 11, gapAfter: 16 },
    { text: `Abonnement mensuel : ${formatDzd(input.subtotalDzd)}`, size: 12 },
    { text: `TVA ${formatRate(input.taxRateBasisPoints)} : ${formatDzd(input.taxDzd)}`, size: 12 },
    { text: `Total à payer : ${formatDzd(input.totalDzd)}`, size: 14 },
  ];
}

function contentStream(lines: readonly Line[]): string {
  let y = pageHeight - margin;
  const ops = lines.map((line) => {
    y -= line.size + 6;
    const op = `BT /F1 ${String(line.size)} Tf ${String(margin)} ${String(y)} Td ${pdfString(line.text)} Tj ET`;
    y -= line.gapAfter ?? 0;
    return op;
  });
  return ops.join("\n");
}

function assertAmounts(input: InvoicePdfInput): void {
  const amounts = [input.subtotalDzd, input.taxDzd, input.totalDzd];
  const isWhole = amounts.every((amount) => Number.isSafeInteger(amount) && amount >= 0);
  if (!isWhole || input.subtotalDzd + input.taxDzd !== input.totalDzd) {
    throw new RangeError("invoice amounts must be whole DZD with subtotal + tax = total");
  }
}

function serialize(objects: readonly string[]): Uint8Array {
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body, "latin1");
  const entries = offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`);
  body += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n${entries.join("")}`;
  body += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\n`;
  body += `startxref\n${String(xrefOffset)}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, "latin1"));
}

export function buildInvoicePdf(input: InvoicePdfInput): Uint8Array {
  assertAmounts(input);
  const stream = contentStream(invoiceLines(input));
  return serialize([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${String(pageWidth)} ${String(pageHeight)}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${String(Buffer.byteLength(stream, "latin1"))} >>\nstream\n${stream}\nendstream`,
  ]);
}
