// One-shot: standardize casing in i18n locale files.
// Rules:
//  - button/action labels → Sentence case (first letter capital)
//  - trailing "." dropped from button labels (they're chrome, not prose)
//  - all-caps editorial eyebrows ("LAST 30 DAYS") → Sentence case
//    (the .eyebrow CSS class will uppercase on render, so we don't double-shout)
//  - status pill labels (live/failed/quiet/staged/active/inactive/pending)
//    → Capitalized so they read as proper labels, not lowercase tags

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, "..", "src", "i18n", "locales");

// Dotted keypaths to normalize. If a key isn't listed, we leave it alone —
// prose blurbs, placeholders, in-line phrases stay as-is.
const KEYS_TO_NORMALIZE = [
  // common
  "common.delete",
  "common.apply",
  "common.clear",
  "common.clear_all",
  "common.prev",
  "common.next",
  "common.density",
  "common.compact",
  "common.comfortable",
  "common.pending",
  // dashboard
  "dashboard.last_30_days",
  "dashboard.report_workers",
  "dashboard.today",
  "dashboard.live",
  "dashboard.failed",
  "dashboard.orders_today",
  "dashboard.payments_today_usd",
  "dashboard.active_clients_30d",
  "dashboard.kind_order",
  "dashboard.kind_payment",
  "dashboard.trend_from_yesterday",
  "dashboard.trend_vs_yesterday",
  "dashboard.trend_this_week",
  "dashboard.trend_new",
  // ops
  "ops.status_live",
  "ops.status_staged",
  "ops.status_failed",
  "ops.status_quiet",
  "ops.last_error",
  "ops.backfill_year",
  "ops.backfill_month",
  "ops.backfill_week",
  "ops.backfill_submit",
  "ops.backfill_done",
  // admin
  "admin.new_user",
  "admin.active",
  "admin.inactive",
  "admin.reset_password",
  "admin.revoke_sessions",
  "admin.delete",
  "admin.bulk_modal_go",
  "admin.form_submit_enroll",
  "admin.form_submit_reset",
  "admin.form_submit_save",
  // debt
  "debt.aging_hide_help",
  "debt.clear_filter",
  "debt.overdue_promise",
];

function capitalize(s) {
  // Find the first Unicode letter (skip leading punctuation like "‹ " or "+ ")
  // and capitalize it. IMPORTANT: \W in JS's /u mode is NOT Unicode-aware —
  // it only excludes [A-Za-z0-9_], which means Cyrillic letters would be
  // treated as "non-word" and the regex would eat the whole word. Use
  // \P{L}* (Unicode "not-a-letter") instead so we stop at the first letter
  // regardless of script.
  return s.replace(/^(\P{L}*)(\p{L})/u, (_m, lead, ch) => lead + ch.toUpperCase());
}

function normalize(value) {
  if (typeof value !== "string") return value;
  let v = value;
  // Drop trailing "." (but keep "…" ellipses).
  if (v.endsWith(".") && !v.endsWith("…")) {
    v = v.slice(0, -1);
  }
  // If the string is ALL CAPS (like "LAST 30 DAYS"), lowercase it first so
  // capitalize() then Title-starts it. Heuristic: if the string has no
  // lowercase letters and has at least 2 uppercase letters, treat as shouty.
  const hasLower = /\p{Ll}/u.test(v);
  const upperCount = (v.match(/\p{Lu}/gu) || []).length;
  if (!hasLower && upperCount >= 2) {
    v = v.toLowerCase();
  }
  v = capitalize(v);
  return v;
}

function getByPath(obj, pathStr) {
  return pathStr.split(".").reduce((o, k) => (o ? o[k] : undefined), obj);
}

function setByPath(obj, pathStr, v) {
  const parts = pathStr.split(".");
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (o[parts[i]] == null) return;
    o = o[parts[i]];
  }
  o[parts[parts.length - 1]] = v;
}

for (const file of fs.readdirSync(LOCALES_DIR)) {
  if (!file.endsWith(".json")) continue;
  const fp = path.join(LOCALES_DIR, file);
  const text = fs.readFileSync(fp, "utf8");
  const data = JSON.parse(text);
  let changed = 0;
  for (const keyPath of KEYS_TO_NORMALIZE) {
    const before = getByPath(data, keyPath);
    if (before === undefined) continue;
    const after = normalize(before);
    if (after !== before) {
      setByPath(data, keyPath, after);
      changed++;
      console.log(`  ${file}: ${keyPath}: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    }
  }
  if (changed > 0) {
    fs.writeFileSync(fp, JSON.stringify(data, null, 2) + "\n", "utf8");
  }
  console.log(`${file}: ${changed} changes`);
}
