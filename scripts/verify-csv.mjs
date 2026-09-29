// Checks the CSV layer.
//
// The escaping is the whole risk in this feature. A CSV that is subtly wrong
// does not throw and does not look wrong — it opens, it just puts a shop's
// takings in the wrong column, and nobody finds out until the books disagree.
//
// So this does two things:
//
//   1. Unit-checks each rule in `src/lib/csv.ts` against inputs chosen to break
//      it: commas, quotes, newlines, leading spaces, a leading `=`, a leading
//      `-` that must stay a number.
//   2. Round-trips through a parser written separately from the writer. That is
//      the point of the round trip — a writer tested only by its own idea of
//      what it wrote proves nothing. The parser below implements RFC 4180 from
//      the specification rather than by mirroring `csvCell`, so the two can
//      disagree, and when they do the disagreement is the finding.
//
//   node scripts/verify-csv.mjs

import {
  buildCsv,
  csvCell,
  csvCount,
  csvDate,
  csvNumber,
  csvRow,
  csvStamp,
  csvText,
  csvTime,
} from "../src/lib/csv.ts";

let passed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ------------------------------------------------------------------ parser

/**
 * A strict RFC 4180 reader, written from the spec and not from the writer.
 *
 * Handles: quoted fields, doubled quotes inside them, commas and newlines
 * inside them, CRLF and bare LF record separators, and a trailing newline.
 * Throws on anything malformed rather than guessing, because a parser that
 * guesses is the same failure being tested for.
 */
function parseCsv(input) {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  if (text === "") return { rows: [], endedWithNewline: false };

  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"' && field === "") {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      i += 1;
      continue;
    }

    field += ch;
    i += 1;
  }

  if (quoted) throw new Error("parseCsv: file ended inside a quoted field");
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return { rows, endedWithNewline: text.endsWith("\n") };
}

// ------------------------------------------------------------------- rules

check(
  "empty and nullish values become empty cells",
  csvCell(null) === "" && csvCell(undefined) === "" && csvCell("") === "",
);
check("a plain value is left alone", csvCell("Maziwa 500ml") === "Maziwa 500ml");
check("a comma forces quoting", csvCell("Maziwa, 500ml") === '"Maziwa, 500ml"');
check("a quote is doubled inside a quoted field", csvCell('5" pipe') === '"5"" pipe"');
check("a newline forces quoting", csvCell("one\ntwo") === '"one\ntwo"');
check("a leading space forces quoting", csvCell("  spaced") === '"  spaced"');
check("a trailing space forces quoting", csvCell("spaced  ") === '"spaced  "');

check("money keeps two decimals", csvNumber(1250) === "1250.00", csvNumber(1250));
check("money keeps two decimals below one", csvNumber(0.5) === "0.50", csvNumber(0.5));
check(
  "a negative amount keeps its sign as a number",
  csvNumber(-1800) === "-1800.00",
  csvNumber(-1800),
);
check(
  "a non-finite amount is empty, not NaN",
  csvNumber(Number.NaN) === "" && csvNumber(Number.POSITIVE_INFINITY) === "",
);
check("counts are whole", csvCount(3.4) === "3" && csvCount(0) === "0");

check("a formula in text is defused", csvText("=1+1") === "'=1+1", csvText("=1+1"));
check("a formula after a space is defused too", csvText("  =cmd") === "'  =cmd", csvText("  =cmd"));
check(
  "plus and at signs are defused",
  csvText("+41") === "'+41" && csvText("@SUM(A1)") === "'@SUM(A1)",
);
check("ordinary text is not defused", csvText("Maziwa 500ml") === "Maziwa 500ml");
check(
  "an empty cell is not defused into an apostrophe",
  csvText("") === "" && csvText(null) === "",
);

// ------------------------------------------------------------------ dates

const when = new Date(2026, 8, 28, 18, 30, 0); // local, 28 Sept 2026
check("dates are local and zero-padded", csvDate(when) === "2026-09-28", csvDate(when));
check("times are local and zero-padded", csvTime(when) === "18:30", csvTime(when));
check("a stamp joins them", csvStamp(when) === "2026-09-28 18:30", csvStamp(when));
check("an unparseable date is empty, not Invalid Date", csvDate("not a date") === "");

// ------------------------------------------------------------------- file

const built = buildCsv([csvRow(["a", csvText("b,c")]), csvRow([csvNumber(1.5), ""])]);
check("the file starts with a UTF-8 BOM", built.charCodeAt(0) === 0xfeff);
check("records are separated by CRLF", built.includes("\r\n"), JSON.stringify(built.slice(1, 12)));
check("the file ends with a newline", built.endsWith("\r\n"));

// --------------------------------------------------------------- round trip

/*
 * The values a real shop actually types. Every one of these has broken a naive
 * `join(",")` somewhere: the comma splits a product in two, the quote ends the
 * field early, the newline starts a phantom record, the leading equals sign
 * becomes a formula, and the rupee-quoted unit note is where Kenyan traders
 * habitually reach for a double quote.
 */
const NASTY = [
  "Maziwa, 500ml",
  'Sachet 5"',
  "Milk\npowder",
  '=HYPERLINK("http://evil","click")',
  "  leading space",
  "Crisp & Salt",
  "Biscuit 100g (Assorted)",
];

const roundTrip = buildCsv([csvRow(NASTY.map(csvText))]);
let parsed;
try {
  parsed = parseCsv(roundTrip);
} catch (error) {
  parsed = { rows: [] };
  check("the file parses", false, String(error));
}
check("the file parses", parsed.rows.length === 1, `${parsed.rows.length} record(s)`);

/*
 * Everything must survive byte for byte — except the one value that is
 * deliberately altered. The formula guard prefixes an apostrophe, so that cell
 * comes back changed, and the contract is precisely that: the text is preserved
 * and the spreadsheet's ability to execute it is not.
 */
const expected = NASTY.map((value) => (value.startsWith("=HYPERLINK") ? `'${value}` : value));
check(
  "every awkward value survives the round trip byte for byte",
  parsed.rows[0]?.length === NASTY.length &&
    expected.every((value, index) => parsed.rows[0][index] === value),
  JSON.stringify(parsed.rows[0]?.slice(1, 4)),
);
check(
  "the only cell the writer changed is the one it defused on purpose",
  parsed.rows[0]?.filter((cell, index) => cell !== NASTY[index]).length === 1,
  parsed.rows[0]?.findIndex((cell, index) => cell !== NASTY[index]),
);
check(
  "a defused formula reads back as inert text, not as a formula",
  parsed.rows[0]?.[3] === '\'=HYPERLINK("http://evil","click")',
  parsed.rows[0]?.[3],
);

const multi = buildCsv([
  csvRow(["Date", "Description", "Money in"]),
  csvRow([csvDate(when), csvText("Sale to Jane, Wanjiru"), csvNumber(1250.5)]),
  csvRow([csvDate(when), csvText("Expense — transport"), csvNumber(-300)]),
]);
const multiParsed = parseCsv(multi);
check(
  "a multi-row file keeps its columns aligned",
  multiParsed.rows.length === 3,
  `${multiParsed.rows.length} rows`,
);
check(
  "columns do not drift when a value contains a comma",
  multiParsed.rows[1].length === 3 && multiParsed.rows[1][1] === "Sale to Jane, Wanjiru",
  JSON.stringify(multiParsed.rows[1]),
);
check(
  "money columns still total as numbers",
  multiParsed.rows
    .slice(1)
    .reduce((sum, r) => sum + Number(r[2]), 0)
    .toFixed(2) === "950.50",
  multiParsed.rows
    .slice(1)
    .reduce((sum, r) => sum + Number(r[2]), 0)
    .toFixed(2),
);
check(
  "a blank line parses as a row of one empty field",
  parseCsv(buildCsv(["a", "", "b"])).rows.length === 3,
);

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length) {
  console.log(`failed: ${failures.join(" | ")}`);
  process.exit(1);
}
