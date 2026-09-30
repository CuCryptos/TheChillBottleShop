// CSV writing and reading. Pure functions only (shared by route handlers,
// server actions and the node:test suite).

// Spreadsheet apps run cells starting with these as formulas.
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/**
 * Splits CSV text into records of fields, honoring quoted fields ("a, b" and
 * "" escapes). Each record carries the 1-based line number it starts on.
 */
export function parseCsv(text: string): { line: number; fields: string[] }[] {
  const records: { line: number; fields: string[] }[] = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let start = 1;
  let touched = false;

  const endRecord = () => {
    fields.push(field);
    if (touched || fields.length > 1 || field !== "") records.push({ line: start, fields });
    fields = [];
    field = "";
    touched = false;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else { if (c === "\n") line++; field += c; }
    } else if (c === '"') { quoted = true; touched = true; }
    else if (c === ",") { fields.push(field); field = ""; touched = true; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRecord();
      line++;
      start = line;
    } else field += c;
  }
  if (field !== "" || fields.length > 0 || touched) endRecord();
  return records;
}
