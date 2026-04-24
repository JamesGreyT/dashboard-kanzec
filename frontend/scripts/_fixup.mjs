// Revert / repair the collateral damage from _folio_to_shadcn.mjs.
// - `eyebrow` JSX prop got expanded to a Tailwind class string; restore the prop name.
// - `mono` → `font-mono` ran twice, producing `font-font-mono`.
// - `serif` → "" zeroed out the bare "serif" marker but left ghost spaces.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOTS = [
  path.join(__dirname, "..", "src", "pages"),
  path.join(__dirname, "..", "src", "components"),
];

const RULES = [
  // font-font-mono → font-mono (the double-expansion).
  [/font-font-mono/g, "font-mono"],
  // `var(--font-font-mono)` → `var(--font-mono)` — same double-expansion inside CSS vars.
  [/var\(--font-font-mono\)/g, "var(--font-mono)"],

  // Restore JSX prop identifier `eyebrow`: the sweeper replaced it with a
  // Tailwind class string. In JSX, a prop is followed by `=` or `?:` or `,` or `}`.
  // Match the literal expanded text exactly.
  [
    /text-xs text-muted-foreground uppercase tracking-wider font-medium(?=\s*[?:=,}])/g,
    "eyebrow",
  ],

  // Some pages had `className="eyebrow ..."` — that was a legit class usage.
  // The restore above only fixed cases followed by a prop-terminator. Any
  // lingering "text-xs text-muted-foreground uppercase tracking-wider font-medium"
  // inside a className is correct — leave it.
];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "ui") continue;
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

let totalFiles = 0;
let totalReplacements = 0;

for (const root of ROOTS) {
  for (const file of walk(root)) {
    let text = fs.readFileSync(file, "utf8");
    let changes = 0;
    for (const [pattern, replacement] of RULES) {
      text = text.replace(pattern, (_m) => {
        changes++;
        return replacement;
      });
    }
    if (changes > 0) {
      fs.writeFileSync(file, text, "utf8");
      totalFiles++;
      totalReplacements += changes;
      console.log(`  ${path.relative(process.cwd(), file)} — ${changes} fixes`);
    }
  }
}

console.log(`\nDone: ${totalReplacements} fixes across ${totalFiles} files.`);
