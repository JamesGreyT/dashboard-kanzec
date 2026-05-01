import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/**
 * PersonaPill — the spine of the Mijozlar 360° table. Each of the ten
 * archetypes maps to one of four urgency tones. Glyph + name + verb;
 * the verb is the operator action ("Call now", "Nurture", "Escalate").
 *
 * 4 tone groups (the page is fundamentally about RISK and OPPORTUNITY,
 * but a ten-hue palette would turn the table into confetti):
 *
 *   red     — debt_trap, whale_at_risk      → urgent action
 *   amber   — sleeping, one_hit, rookie     → watch / nurture
 *   emerald — champion, loyal, bulk         → healthy
 *   gray    — lost, regular                 → dormant / baseline
 *
 * Used in two places:
 *   - in-row, default `variant="row"` — letter mark + name + verb stacked
 *   - in the ribbon, `variant="ribbon"` — letter mark + name + count chip,
 *     active state filled with the tone
 */

export type PersonaKey =
  | "debt_trap"
  | "whale_at_risk"
  | "lost"
  | "sleeping"
  | "one_hit"
  | "rookie"
  | "champion"
  | "loyal"
  | "bulk"
  | "regular";

export const PERSONA_ORDER: PersonaKey[] = [
  "debt_trap",
  "whale_at_risk",
  "champion",
  "loyal",
  "bulk",
  "rookie",
  "sleeping",
  "one_hit",
  "lost",
  "regular",
];

type Tone = "red" | "amber" | "emerald" | "gray";

const PERSONA_TONE: Record<PersonaKey, Tone> = {
  debt_trap: "red",
  whale_at_risk: "red",
  sleeping: "amber",
  one_hit: "amber",
  rookie: "amber",
  champion: "emerald",
  loyal: "emerald",
  bulk: "emerald",
  lost: "gray",
  regular: "gray",
};

const PERSONA_GLYPH: Record<PersonaKey, string> = {
  debt_trap: "D",
  whale_at_risk: "W",
  champion: "C",
  loyal: "L",
  bulk: "B",
  rookie: "R",
  sleeping: "Z",
  one_hit: "O",
  lost: "X",
  regular: "·",
};

// Glyph square — the tone-colored mark. Sized variants per call site.
const GLYPH_TONE_BG: Record<Tone, string> = {
  red:     "bg-destructive/90 text-destructive-foreground",
  amber:   "bg-amber-500 text-white dark:bg-amber-600",
  emerald: "bg-emerald-600 text-white",
  gray:    "bg-muted-foreground/30 text-foreground",
};
const GLYPH_TONE_INACTIVE: Record<Tone, string> = {
  red:     "bg-destructive/10 text-destructive border-destructive/30",
  amber:   "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  gray:    "bg-muted text-muted-foreground border-border",
};

// Active ribbon chip background — solid tone tint.
const CHIP_ACTIVE: Record<Tone, string> = {
  red:     "bg-destructive/10 border-destructive/50 text-destructive shadow-sm",
  amber:   "bg-amber-500/10 border-amber-500/50 text-amber-800 dark:text-amber-300 shadow-sm",
  emerald: "bg-emerald-500/10 border-emerald-500/50 text-emerald-800 dark:text-emerald-300 shadow-sm",
  gray:    "bg-muted border-foreground/30 text-foreground shadow-sm",
};

export function personaTone(key: PersonaKey): Tone {
  return PERSONA_TONE[key];
}

/** Inline pill used inside the table row — glyph + name + verb stacked. */
export default function PersonaPill({ persona }: { persona: PersonaKey | string }) {
  const { t } = useTranslation();
  const key = (persona as PersonaKey);
  const tone = PERSONA_TONE[key] ?? "gray";
  const glyph = PERSONA_GLYPH[key] ?? "·";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className={cn(
          "shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md font-display font-medium text-[14px] leading-none",
          GLYPH_TONE_BG[tone],
        )}
        aria-hidden
      >
        {glyph}
      </span>
      <div className="min-w-0">
        <div className="font-display text-[13px] leading-tight text-foreground truncate">
          {t(`personas.${key}.name`, { defaultValue: key })}
        </div>
        <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground mt-0.5 truncate">
          {t(`personas.${key}.verb`, { defaultValue: "" })}
        </div>
      </div>
    </div>
  );
}

/** Ribbon chip — toggles the persona filter. Shows count + active state. */
export function PersonaRibbonChip({
  persona,
  count,
  active,
  onClick,
}: {
  persona: PersonaKey;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const tone = PERSONA_TONE[persona];
  const glyph = PERSONA_GLYPH[persona];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group flex items-center gap-2 h-9 pl-1 pr-3 rounded-full border transition-all duration-150 outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        active
          ? CHIP_ACTIVE[tone] + " scale-[1.02]"
          : "bg-card border-border/60 text-foreground/80 hover:border-foreground/30",
      )}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center w-7 h-7 rounded-full text-[12px] font-display font-medium leading-none border",
          active ? GLYPH_TONE_BG[tone] + " border-transparent" : GLYPH_TONE_INACTIVE[tone],
        )}
        aria-hidden
      >
        {glyph}
      </span>
      <span className="text-[12px] font-medium whitespace-nowrap">
        {t(`personas.${persona}.name`, { defaultValue: persona })}
      </span>
      <span
        className={cn(
          "font-mono tabular-nums text-[11px] ml-0.5",
          active ? "" : "text-muted-foreground",
        )}
      >
        {count.toLocaleString("en-US")}
      </span>
    </button>
  );
}

/** "All / Barchasi" chip — leftmost. Tone-neutral, primary tint when active. */
export function AllRibbonChip({
  count,
  active,
  onClick,
}: {
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-2 h-9 pl-1 pr-3 rounded-full border transition-all duration-150 outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        active
          ? "bg-primary/10 border-primary/50 text-primary shadow-sm scale-[1.02]"
          : "bg-card border-border/60 text-foreground/80 hover:border-foreground/30",
      )}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center w-7 h-7 rounded-full text-[12px] font-display font-medium border",
          active ? "bg-primary text-primary-foreground border-transparent" : "bg-primary/5 text-primary border-primary/20",
        )}
        aria-hidden
      >
        ·
      </span>
      <span className="text-[12px] font-medium uppercase tracking-[0.10em]">
        {t("clients360.persona_all", { defaultValue: "Barchasi" })}
      </span>
      <span
        className={cn(
          "font-mono tabular-nums text-[11px] ml-0.5",
          active ? "" : "text-muted-foreground",
        )}
      >
        {count.toLocaleString("en-US")}
      </span>
    </button>
  );
}
