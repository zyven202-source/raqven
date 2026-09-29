// Checks the glass system in the places it is easy to break silently.
//
// Two failure modes are worth a check, and neither shows up in a type-check:
//
//   1. A `glass-N` class used without a `backdrop-blur-*` beside it. The level
//      utilities deliberately do not carry the blur — a raw `backdrop-filter`
//      in a hand-written `@utility` loses its unprefixed half to the production
//      minifier and the glass silently disappears in the browser it was written
//      for. That is a bug this project has already shipped once, so it gets a
//      check rather than a comment.
//   2. A level used where a different level belongs. Not fatal, but the whole
//      point of three levels is that they mean something, so an unreviewed
//      level-3 on a permanent card is worth surfacing.
//
//   node scripts/verify-glass.mjs

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");

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

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|css)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(SRC);

/**
 * Every string literal in a source file, treated as a possible class list.
 *
 * Deliberately not clever. A class can arrive through `className="..."`,
 * through a `cva` variant, through a `cn(...)` argument, or through a template
 * literal, and a regex that tries to understand which is which will eventually
 * miss a real usage and report a false pass. A literal that happens to mention
 * a glass level is a class list for our purposes; a literal that does not is
 * skipped.
 */
const classAttrs = [];
for (const file of files) {
  if (file.endsWith(".css")) continue;
  const text = readFileSync(file, "utf8");
  const literals = [...text.matchAll(/"([^"\n]*)"/g), ...text.matchAll(/`([^`]*)`/g)];
  for (const m of literals) {
    classAttrs.push({ file: relative(ROOT, file), classes: m[1] });
  }
}

const glassAttrs = classAttrs.filter((a) => /glass-[123]\b/.test(a.classes));

// --- 1. every glass level ships with a blur
const withoutBlur = glassAttrs.filter(
  (a) => /(^|\s)glass-[123](\s|$)/.test(a.classes) && !/backdrop-blur/.test(a.classes),
);

check(
  "every glass level is paired with a backdrop blur",
  withoutBlur.length === 0,
  withoutBlur.map((a) => `${a.file}: ${a.classes.slice(0, 70)}`).join("\n      ") || "all paired",
);

// --- 2. the levels are all defined and all used
const css = readFileSync(join(SRC, "styles.css"), "utf8");
for (const level of ["glass-1", "glass-2", "glass-3"]) {
  check(`the ${level} utility is defined`, css.includes(`@utility ${level} {`));
}

for (const level of ["glass-1", "glass-2", "glass-3"]) {
  const uses = glassAttrs.filter((a) => new RegExp(`(^|\\s)${level}(\\s|$)`).test(a.classes));
  check(`the ${level} level is used`, uses.length > 0, `${uses.length} site(s)`);
}
// The navigation's own material is declared in CSS rather than inline, so it
// does not appear in the literal scan above.
check(
  "the floating navigation has its own material",
  css.includes("@utility glass-bar {") && css.includes("@utility glass-sheet {"),
);

// --- 3. tokens exist in both themes.
//     Colour tokens live in `:root`, depth tokens in `@theme inline`; both are
//     emitted onto `:root` by Tailwind, so either counts as the light theme.
// `.dark {` rather than `.dark`, which also matches the `@custom-variant dark`
// declaration near the top of the file and would slice the wrong block.
const themeStart = css.search(/@theme inline/);
const rootStart = css.search(/^:root \{/m);
const darkStart = css.search(/^\.dark \{/m);
const lightCss = css.slice(0, darkStart);
const darkCss = css.slice(darkStart);
check("the theme blocks were found", themeStart >= 0 && rootStart >= 0 && darkStart > rootStart);
for (const token of [
  "--glass-1:",
  "--glass-2:",
  "--glass-3:",
  "--hover-line:",
  "--depth-1:",
  "--depth-2:",
  "--depth-3:",
]) {
  check(`${token} is defined in light`, lightCss.includes(token));
  check(`${token} is defined in dark`, darkCss.includes(token));
}

// --- 4. hover is gated away from touch
const hoverBlock = css.slice(css.indexOf("@utility hover-glass"), css.indexOf("@utility tnum"));
check(
  "hover is gated on a real pointer",
  /@media \(hover: hover\) and \(pointer: fine\)/.test(hoverBlock),
  "phones never get a stuck hover state",
);

// --- 5. press exists and is applied
check("the press utility is defined", css.includes("@utility press {"));
const pressed = classAttrs.filter((a) => /(^|\s)press(\s|$)/.test(a.classes));
const hovered = classAttrs.filter((a) => /(^|\s)hover-glass(\s|$)/.test(a.classes));
check("press is applied to interactive elements", pressed.length > 0, `${pressed.length} site(s)`);
check("hover is applied to interactive elements", hovered.length > 0, `${hovered.length} site(s)`);

// --- 6. focus is still visible
check(
  "keyboard focus has a visible ring",
  /:focus-visible\s*\{[^}]*outline:\s*2px solid/.test(css),
);

// --- 7. depth is restrained, not a pile of big shadows
const big = [...css.matchAll(/box-shadow:\s*([^;]+);/g)]
  .flatMap((m) => m[1].split(/,(?![^(]*\))/))
  .map((s) => s.trim())
  .filter((s) => {
    const nums = s.match(/-?\d+(?:\.\d+)?px/g)?.map(Number) ?? [];
    return nums.some((n) => Math.abs(n) > 60);
  });
check(
  "no oversized shadows — depth is built from hairlines and tight offsets",
  big.length === 0,
  big.length ? `${big.length} offset(s) over 60px` : "all offsets small",
);

// --- 8. the radius system stayed restrained
const oversizedRadius = [...css.matchAll(/--radius-[a-z0-9-]+:\s*([\d.]+)rem/g)]
  .map((m) => ({ name: m[0].split(":")[0], value: Number(m[1]) }))
  .filter((r) => !r.name.startsWith("--radius-glass") && r.value > 0.9);
check(
  "the radius ceiling still holds outside the glass",
  oversizedRadius.length === 0,
  oversizedRadius.map((r) => `${r.name}=${r.value}rem`).join(", ") || "nothing over 0.9rem",
);

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length) {
  console.log(`failed: ${failures.join(" | ")}`);
  process.exit(1);
}
