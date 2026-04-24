// One-shot migration: replace Folio Amber class tokens in page files with
// shadcn/ui-compatible Tailwind tokens. Run once with `node scripts/_folio_to_shadcn.mjs`.
//
// Rules are ordered — longest/most-specific first so they win over substrings.
// `text-ink-3` must replace before `text-ink`; `bg-mark-bg` before `bg-mark`.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PAGES_DIR = path.join(__dirname, "..", "src", "pages");
const COMPONENTS_DIR = path.join(__dirname, "..", "src", "components");

// Ordered — longer / more specific patterns first.
const RULES = [
  // Status tones — rewrite first because they share prefixes with the base tokens.
  [/\bbg-good-bg\b/g, "bg-emerald-100 dark:bg-emerald-900/30"],
  [/\btext-good\b/g, "text-emerald-700 dark:text-emerald-400"],
  [/\bborder-good\b/g, "border-emerald-500"],
  [/\bbg-good\b/g, "bg-emerald-500"],

  [/\bbg-warn-bg\b/g, "bg-amber-100 dark:bg-amber-900/30"],
  [/\btext-warn\b/g, "text-amber-700 dark:text-amber-400"],
  [/\bborder-warn\b/g, "border-amber-500"],
  [/\bbg-warn\b/g, "bg-amber-500"],

  [/\bbg-risk-bg\b/g, "bg-red-100 dark:bg-red-900/30"],
  [/\btext-risk\b/g, "text-red-700 dark:text-red-400"],
  [/\bborder-risk\b/g, "border-red-500"],
  [/\bbg-risk\b/g, "bg-red-500"],

  [/\bbg-quiet-bg\b/g, "bg-muted"],
  [/\btext-quiet\b/g, "text-muted-foreground"],
  [/\bbg-quiet\b/g, "bg-muted"],

  // Ink scale — tertiary → muted-foreground, secondary → foreground/80.
  [/\btext-ink-3\b/g, "text-muted-foreground"],
  [/\btext-ink-2\b/g, "text-foreground/80"],
  [/\btext-ink\b/g, "text-foreground"],
  [/\bbg-ink\b/g, "bg-foreground"],

  // Mark (accent) family.
  [/\bbg-mark-bg\b/g, "bg-primary/10"],
  [/\btext-mark-2\b/g, "text-primary/80"],
  [/\bbg-mark-2\b/g, "bg-primary/80"],
  [/\btext-mark\b/g, "text-primary"],
  [/\bbg-mark\b/g, "bg-primary"],
  [/\bborder-mark\b/g, "border-primary"],
  [/\bring-mark\b/g, "ring-ring"],
  [/\bdecoration-mark\b/g, "decoration-primary"],

  // Paper (bg).
  [/\bbg-paper-2\b/g, "bg-muted"],
  [/\bbg-paper\b/g, "bg-background"],

  // Rules / borders.
  [/\bborder-rule-2\b/g, "border-border"],
  [/\bborder-rule\b/g, "border-border"],

  // Radius.
  [/\brounded-card\b/g, "rounded-lg"],
  [/\brounded-chip\b/g, "rounded-md"],

  // Shadows.
  [/\bshadow-card-hover\b/g, "shadow-md"],
  [/\bshadow-card\b/g, "shadow-sm"],
  [/\bshadow-btn-hover\b/g, "shadow-md"],
  [/\bshadow-btn\b/g, "shadow-sm"],
  [/\bshadow-popover\b/g, "shadow-lg"],

  // Backdrop.
  [/\bbackdrop-blur-drawer\b/g, "backdrop-blur-sm"],

  // Typography classes from the old config.
  [/\btext-heading-xl\b/g, "text-5xl font-semibold tracking-tight"],
  [/\btext-heading-lg\b/g, "text-4xl font-semibold tracking-tight"],
  [/\btext-heading-md\b/g, "text-2xl font-semibold tracking-tight"],
  [/\btext-heading-sm\b/g, "text-xl font-semibold"],
  [/\btext-stat-xl\b/g, "text-4xl"],
  [/\btext-stat-md\b/g, "text-2xl"],
  [/\btext-body\b/g, "text-sm"],
  [/\btext-label\b/g, "text-sm"],
  [/\btext-caption\b/g, "text-xs"],
  [/\btext-eyebrow\b/g, "text-xs"],
  [/\btext-mono-sm\b/g, "text-xs"],
  [/\btext-mono-xs\b/g, "text-xs"],

  // Folio utility classes that were global.css helpers — strip them.
  [/\bserif-italic\b/g, "font-semibold italic"],
  [/\bserif\b(?!-)/g, ""], // bare `.serif` marker
  [/\bmono\b(?=[^-])/g, "font-mono"], // the bare `.mono` marker — match only `mono ` not `mono-sm`
  [/\beyebrow-mono\b/g, "text-xs text-muted-foreground uppercase tracking-wider font-medium"],
  [/\beyebrow\b/g, "text-xs text-muted-foreground uppercase tracking-wider font-medium"],
  [/\bcard-interactive\b/g, "transition-shadow hover:shadow-md"],
  [/\bmark-stop\b/g, ""],
  [/\bdotted-leader\b/g, "border-b border-dotted border-border flex-1 mx-2"],
  [/\bleader\b(?!-)/g, "border-t border-border my-3"],
  [/\brule-wave\b/g, ""],
  [/\banimate-live-pulse\b/g, "animate-pulse"],
  [/\banimate-enter-up\b/g, "animate-in fade-in-0 slide-in-from-bottom-2"],
  [/\bstagger-[0-5]\b/g, ""],

  // ring-mark/30 etc. — fix the slash variant.
  [/ring-ring\/(\d+)/g, "ring-ring/$1"],

  // Backgrounds on ink — e.g. `bg-ink/20`
  [/\bbg-foreground\/(\d+)/g, "bg-foreground/$1"],
];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "ui") continue; // don't touch shadcn primitives
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const targets = [...walk(PAGES_DIR), ...walk(COMPONENTS_DIR)];
let totalFiles = 0;
let totalReplacements = 0;

for (const file of targets) {
  let text = fs.readFileSync(file, "utf8");
  let changes = 0;
  for (const [pattern, replacement] of RULES) {
    text = text.replace(pattern, (m) => {
      changes++;
      return replacement;
    });
  }
  if (changes > 0) {
    // Collapse any double spaces introduced by empty replacements inside className strings.
    text = text.replace(/className=(["'`])([^"'`]*?)\1/g, (_m, q, cls) => {
      const cleaned = cls.replace(/\s+/g, " ").trim();
      return `className=${q}${cleaned}${q}`;
    });
    fs.writeFileSync(file, text, "utf8");
    totalFiles++;
    totalReplacements += changes;
    console.log(`  ${path.relative(process.cwd(), file)} — ${changes} replacements`);
  }
}

console.log(`\nDone: ${totalReplacements} replacements across ${totalFiles} files.`);
