/**
 * CSV, written by hand.
 *
 * There is no CSV library in this project and there is not going to be one. The
 * format is four rules long, and the only part that is genuinely fiddly is the
 * escaping — which is exactly the part a naive `join(",")` gets wrong, and gets
 * wrong in a way that silently corrupts a shop's books rather than throwing.
 *
 * ## The rules this file exists to enforce
 *
 *   1. **Quote anything that could end a field.** A comma, a quote, a newline,
 *      or a leading or trailing space. Inside a quoted field, a quote is
 *      doubled. A product called `Maziwa, 500ml` is the ordinary case, not an
 *      edge case.
 *   2. **Numbers are numbers.** Two decimal places, no thousands separator, no
 *      currency symbol. `1,250.00` is not a number to a spreadsheet, it is two
 *      columns, and the second one then swallows whatever was meant to follow.
 *   3. **Text that a spreadsheet would execute is defused.** A cell beginning
 *      `=`, `+`, `-` or `@` is a formula to Excel and LibreOffice. A customer
 *      who types that into a name field should not get a formula on the
 *      owner's machine, so those cells are prefixed with an apostrophe. It is
 *      applied to text only, never to the numbers above.
 *   4. **The file is UTF-8 with a BOM and CRLF line endings.** Without the BOM,
 *      Excel on Windows reads the file as the local code page and mangles every
 *      non-ASCII character in it. CRLF is what RFC 4180 specifies and what
 *      Excel assumes.
 *
 * Escaping and joining are deliberately separate steps. `csvRow` joins cells
 * that the helpers below have *already* escaped, because running a second
 * escape over an escaped cell double-quotes it — the failure mode that produces
 * a file full of `""` and one very confused bookkeeper.
 */

/** Tells Excel the file is UTF-8, rather than the local code page. */
const BOM = "﻿";

/** RFC 4180 line ending, and what Excel writes. */
const EOL = "\r\n";

const NEEDS_QUOTING = /[",\r\n]/;

/**
 * What a spreadsheet treats as the start of a formula.
 *
 * Leading whitespace is stripped first because Excel ignores it when deciding,
 * so `" =1+1"` is a formula too.
 */
const FORMULA_START = /^[=+\-@\t\r\n]/;

/** Escape one already-stringified value. Null and undefined become empty cells. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text === "") return "";
  if (NEEDS_QUOTING.test(text) || text !== text.trim()) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Escape a value that came from a person — a product name, a note, a customer.
 *
 * Same as `csvCell`, but defuses formula injection. Only ever use this for text
 * the shop typed; running it over a number would turn `-500` into text.
 */
export function csvText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text === "") return "";
  if (FORMULA_START.test(text.trimStart())) return csvCell(`'${text}`);
  return csvCell(text);
}

/**
 * A money or quantity value: two decimal places, no separators, never quoted.
 *
 * Two places because every currency Pith deals in has two. Non-finite input
 * becomes an empty cell rather than `NaN`, which a spreadsheet would show as
 * text and quietly sort to the end of a column.
 */
export function csvNumber(value: number | string | null | undefined): string {
  const amount = typeof value === "string" ? Number(value) : value;
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "";
  return amount.toFixed(2);
}

/** A whole number, for counts and quantities. */
export function csvCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return String(Math.round(value));
}

/**
 * Join cells that have already been escaped by the helpers above.
 *
 * Deliberately does not escape: see the note at the top of the file.
 */
export function csvRow(cells: readonly string[]): string {
  return cells.join(",");
}

/** A blank line, used to separate the sections of a multi-table file. */
export const CSV_BLANK = "";

/** Assemble the finished file: BOM, rows, and a trailing newline. */
export function buildCsv(rows: readonly string[]): string {
  return `${BOM}${rows.join(EOL)}${EOL}`;
}

/** `2026-09-28` in local time — the day a shopkeeper means. */
export function csvDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `18:30` in local time. */
export function csvTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `2026-09-28 18:30` in local time, for a header or a note. */
export function csvStamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${csvDate(date)} ${csvTime(date)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Hand the file to the browser.
 *
 * A blob URL rather than a `data:` URI: a `data:` URL has to live inside the
 * markup and a report can be hundreds of kilobytes, and both are refused well
 * before that in some browsers. The URL is revoked on the next tick rather than
 * immediately, because revoking it in the same statement as the click cancels
 * the download in some browsers — a download that silently does not happen is
 * worse than one that leaks a blob for a moment.
 *
 * Returns false when there is no DOM, so a caller running under a test runner
 * gets a clear "nothing was downloaded" rather than a thrown ReferenceError.
 */
export function downloadCsv(filename: string, csv: string): boolean {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return false;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}
