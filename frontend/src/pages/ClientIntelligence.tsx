import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  Phone, FileEdit, ArrowUpRight, AlertCircle, AlertTriangle, Check,
  ChevronsUpDown, X, Filter,
} from "lucide-react";

import { api } from "../lib/api";
import PageHeading from "../components/PageHeading";
import { fmtNum } from "../components/MetricCard";
import RankedTable, { type ColumnDef, type Page } from "../components/RankedTable";
import AgingBar from "../components/AgingBar";
import QuickContactDialog from "../components/QuickContactDialog";
import ScopeChip from "../components/ScopeChip";
import PersonaPill, {
  AllRibbonChip, PersonaRibbonChip, PERSONA_ORDER, type PersonaKey,
} from "../components/PersonaPill";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface Aging { b1_30: number; b31_60: number; b61_90: number; b90_plus: number; }
interface ClientRow {
  person_id: string;
  name: string;
  tin: string | null;
  client_group: string | null;
  direction: string | null;
  region: string | null;
  room: string | null;
  phone: string | null;
  persona: PersonaKey;
  recency_days: number | null;
  ltv: number;
  aov: number;
  order_count: number;
  trajectory_pct: number | null;
  sku_breadth: number;
  outstanding: number;
  aging: Aging;
  risk_score: number;
  predicted_next_buy: string | null;
  days_overdue_for_repeat: number | null;
  last_contact_at: string | null;
  last_contact_outcome: string | null;
}
interface IntelligenceResp {
  rows: ClientRow[];
  total: number;
  page: number;
  size: number;
  persona_counts: Record<PersonaKey, number>;
}
interface FilterOptions { managers: string[]; regions: string[]; directions: string[]; }

type Trajectory = "growing" | "flat" | "declining";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ClientIntelligence() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  // ---- Filter state
  const [search, setSearch] = useState("");
  const [personas, setPersonas] = useState<PersonaKey[]>([]);
  const [managers, setManagers] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [directions, setDirections] = useState<string[]>([]);
  const [hasOverdueDebt, setHasOverdueDebt] = useState(false);
  const [highRisk, setHighRisk] = useState(false);
  const [trajectory, setTrajectory] = useState<Trajectory | "">("");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);
  const [sort, setSort] = useState("recency:asc");
  const [contactDialog, setContactDialog] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    document.title = t("clients360.title", { defaultValue: "Mijozlar 360°" }) + " · Kanzec";
  }, [t]);

  // ---- Build query string for /intelligence
  const qs = useMemo(() => {
    const q = new URLSearchParams();
    if (search.trim()) q.set("search", search.trim());
    if (personas.length) q.set("persona", personas.join(","));
    if (managers.length) q.set("manager", managers.join(","));
    if (regions.length) q.set("region", regions.join(","));
    if (directions.length) q.set("direction", directions.join(","));
    if (hasOverdueDebt) q.set("has_overdue_debt", "true");
    if (highRisk) q.set("high_risk", "true");
    if (trajectory) q.set("trajectory", trajectory);
    q.set("sort", sort.split(":")[0]);
    q.set("page", String(page));
    q.set("size", String(size));
    return q.toString();
  }, [search, personas, managers, regions, directions, hasOverdueDebt, highRisk, trajectory, sort, page, size]);

  const intelligenceQ = useQuery({
    queryKey: ["clients.intelligence", qs],
    queryFn: () => api<IntelligenceResp>(`/api/clients/intelligence?${qs}`),
    staleTime: 30_000,
  });

  const optionsQ = useQuery({
    queryKey: ["clients.filter_options"],
    queryFn: () => api<FilterOptions>("/api/clients/filter_options"),
    staleTime: 5 * 60_000,
  });

  const counts = intelligenceQ.data?.persona_counts;
  const totalAll = useMemo(() => {
    if (!counts) return 0;
    return Object.values(counts).reduce((a, b) => a + b, 0);
  }, [counts]);

  // Table columns — composite cells, multi-line typography, persona is the spine.
  const columns: ColumnDef<ClientRow>[] = useMemo(() => [
    {
      key: "name",
      label: t("clients360.col_client", { defaultValue: "Mijoz" }),
      sortable: true,
      width: "240px",
      render: (r) => (
        <div className="min-w-0 max-w-[240px]">
          <div className="flex items-center gap-1.5">
            {r.client_group && <TierGlyph tier={r.client_group} />}
            <span className="truncate font-medium text-[13px] text-foreground">
              {r.name}
            </span>
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground truncate">
            {[r.region, r.direction].filter(Boolean).join("  ·  ") || "—"}
          </div>
        </div>
      ),
    },
    {
      key: "persona",
      label: t("clients360.col_persona", { defaultValue: "Persona" }),
      sortable: false,
      width: "200px",
      render: (r) => <PersonaPill persona={r.persona} />,
    },
    {
      key: "recency",
      label: t("clients360.col_activity", { defaultValue: "Faollik" }),
      sortable: true,
      numeric: true,
      width: "120px",
      render: (r) => (
        <div className="text-right">
          <div className={cn("font-mono tabular-nums text-[14px] leading-tight", recencyTone(r.recency_days))}>
            {r.recency_days != null ? `${r.recency_days}${t("clients360.day_unit", { defaultValue: "k" })}` : "—"}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.10em] text-muted-foreground tabular-nums">
            {r.order_count.toLocaleString("en-US")} {t("clients360.orders_unit", { defaultValue: "buyurtma" })}
          </div>
          <TrajectoryLine pct={r.trajectory_pct} />
        </div>
      ),
    },
    {
      key: "ltv",
      label: t("clients360.col_value", { defaultValue: "Qiymat" }),
      sortable: true,
      numeric: true,
      width: "140px",
      render: (r) => (
        <div className="text-right">
          <div className="font-mono tabular-nums text-[14px] leading-tight text-foreground">
            ${fmtNum(r.ltv, true)}
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
            AOV ${fmtNum(r.aov, true)}
          </div>
          {r.sku_breadth > 0 && (
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.10em] text-muted-foreground">
              {r.sku_breadth} {t("clients360.brands_unit", { defaultValue: "brend" })}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "outstanding",
      label: t("clients360.col_debt", { defaultValue: "Qarz" }),
      sortable: true,
      numeric: true,
      width: "150px",
      render: (r) =>
        r.outstanding > 0 ? (
          <div className="flex flex-col items-end gap-1">
            <div
              className={cn(
                "font-mono tabular-nums text-[14px] leading-tight",
                r.aging.b90_plus > 0
                  ? "text-destructive font-medium"
                  : r.aging.b61_90 > 0
                    ? "text-amber-700 dark:text-amber-400 font-medium"
                    : "text-foreground",
              )}
            >
              ${fmtNum(r.outstanding, true)}
            </div>
            <AgingBar
              segments={{
                a0_30: r.aging.b1_30,
                a31_60: r.aging.b31_60,
                a61_90: r.aging.b61_90,
                a91_plus: r.aging.b90_plus,
              }}
              width={110}
              height={5}
            />
          </div>
        ) : (
          <span className="text-muted-foreground/50 text-[12px]">—</span>
        ),
    },
    {
      key: "next_buy",
      label: t("clients360.col_cycle", { defaultValue: "Sikl" }),
      sortable: true,
      numeric: true,
      width: "120px",
      render: (r) => {
        if (!r.predicted_next_buy) {
          return <span className="text-muted-foreground/50 text-[12px]">—</span>;
        }
        const overdue = (r.days_overdue_for_repeat ?? 0) > 0;
        return (
          <div className="text-right">
            <div
              className={cn(
                "font-mono tabular-nums text-[12px] leading-tight",
                overdue ? "text-destructive font-medium" : "text-foreground",
              )}
            >
              {formatShortDate(r.predicted_next_buy, i18n.language)}
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.10em] text-muted-foreground">
              {overdue
                ? `${r.days_overdue_for_repeat}${t("clients360.day_unit", { defaultValue: "k" })} ${t("clients360.overdue_short", { defaultValue: "kech" })}`
                : t("clients360.on_cycle", { defaultValue: "siklda" })}
            </div>
          </div>
        );
      },
    },
    {
      key: "manager",
      label: t("clients360.col_manager", { defaultValue: "Menejer" }),
      sortable: false,
      width: "140px",
      render: (r) => (
        <div className="text-[12px] text-muted-foreground truncate max-w-[140px]">
          {r.room || "—"}
        </div>
      ),
    },
    {
      key: "last_contact",
      label: t("clients360.col_last_contact", { defaultValue: "Oxirgi aloqa" }),
      sortable: true,
      width: "160px",
      render: (r) =>
        r.last_contact_at ? (
          <div>
            <div className="font-mono tabular-nums text-[12px] text-foreground leading-tight">
              {relativeDate(r.last_contact_at, i18n.language, t)}
            </div>
            {r.last_contact_outcome && (
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.10em] text-muted-foreground italic truncate max-w-[160px]">
                {t(`debt_dossier.outcome.${r.last_contact_outcome}`, {
                  defaultValue: r.last_contact_outcome,
                })}
              </div>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground/50 text-[12px]">—</span>
        ),
    },
    {
      key: "actions",
      label: "",
      sortable: false,
      width: "104px",
      render: (r) => (
        <div className="flex items-center gap-0.5 justify-end">
          {r.phone && (
            <a
              href={`tel:${r.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
              title={`${t("clients360.action_call", { defaultValue: "Qo'ng'iroq" })} ${r.phone}`}
              aria-label="call"
            >
              <Phone className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setContactDialog({ id: r.person_id, name: r.name }); }}
            className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
            title={t("clients360.action_log", { defaultValue: "Aloqa qo'shish" }) as string}
            aria-label="log contact"
          >
            <FileEdit className="h-3.5 w-3.5" />
          </button>
          <Link
            to={`/collection/debt/client/${r.person_id}`}
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
            title={t("clients360.action_open", { defaultValue: "Mijoz dosyesini ochish" }) as string}
            aria-label="open"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, i18n.language]);

  // ---- Persona ribbon chip handlers
  const togglePersona = (p: PersonaKey) => {
    setPage(0);
    setPersonas((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  };
  const clearPersonas = () => { setPage(0); setPersonas([]); };

  // ---- Active-filter count (drives the "filtrlar faol" pill in the toolbar)
  const activeFilterCount =
    managers.length + regions.length + directions.length
    + (hasOverdueDebt ? 1 : 0) + (highRisk ? 1 : 0) + (trajectory ? 1 : 0);

  const clearAllFilters = () => {
    setManagers([]); setRegions([]); setDirections([]);
    setHasOverdueDebt(false); setHighRisk(false); setTrajectory("");
    setPage(0);
  };

  const isEmpty = !intelligenceQ.isLoading && (intelligenceQ.data?.rows.length ?? 0) === 0;

  return (
    <div className="pb-14">
      <PageHeading
        crumb={[
          t("nav.clients_group", { defaultValue: "Mijozlar" }),
          t("clients360.title", { defaultValue: "Mijozlar 360°" }),
        ]}
        title={t("clients360.title", { defaultValue: "Mijozlar 360°" })}
        subtitle={t("clients360.subtitle", {
          defaultValue: "Bir mijoz, bir qator. Kim sotib olishga yaqin · kim yo'qolyapti · kim qarz.",
        })}
      />

      {/* ──────────────────────────────────────────────────────────────────
          Persona ribbon — primary lever + legend with counts. Always
          visible at the top of the table, never hidden behind a dropdown.
          The 10 archetypes are tone-coded (4 urgency tiers) and ordered
          by operator priority: red (act now), emerald (healthy), amber
          (watch), gray (dormant). "Barchasi" is the leftmost reset chip.
      ────────────────────────────────────────────────────────────────────── */}
      <section className="stagger-1 mb-7">
        <div className="flex items-baseline justify-between mb-3">
          <div className="eyebrow !tracking-[0.18em]">
            {t("clients360.persona_eyebrow", { defaultValue: "Persona" })}
            <span aria-hidden className="font-display-italic text-primary ml-[1px]">.</span>
          </div>
          {personas.length > 0 && (
            <button
              type="button"
              onClick={clearPersonas}
              className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("clients360.clear_personas", { defaultValue: "Tozalash" })}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <AllRibbonChip
            count={totalAll}
            active={personas.length === 0}
            onClick={clearPersonas}
          />
          {PERSONA_ORDER.map((p) => (
            <PersonaRibbonChip
              key={p}
              persona={p}
              count={counts?.[p] ?? 0}
              active={personas.includes(p)}
              onClick={() => togglePersona(p)}
            />
          ))}
        </div>
        <hr className="mark-rule mt-5" aria-hidden />
      </section>

      {/* ──────────────────────────────────────────────────────────────────
          Toolbar — secondary filters (manager / region / direction multi-
          select), trajectory + 2 toggles, sort selector, scope chip. The
          search field lives inside the table (next section) since
          RankedTable owns its own search input.
      ────────────────────────────────────────────────────────────────────── */}
      <section className="stagger-2 mb-5">
        <div className="flex items-center flex-wrap gap-2">
          <MultiPickPopover
            label={t("clients360.filter_manager", { defaultValue: "Menejer" }) as string}
            placeholder={t("clients360.filter_search", { defaultValue: "qidirish…" }) as string}
            options={optionsQ.data?.managers ?? []}
            value={managers}
            onChange={(v) => { setPage(0); setManagers(v); }}
          />
          <MultiPickPopover
            label={t("clients360.filter_region", { defaultValue: "Region" }) as string}
            placeholder={t("clients360.filter_search", { defaultValue: "qidirish…" }) as string}
            options={optionsQ.data?.regions ?? []}
            value={regions}
            onChange={(v) => { setPage(0); setRegions(v); }}
          />
          <MultiPickPopover
            label={t("clients360.filter_direction", { defaultValue: "Yo'nalish" }) as string}
            placeholder={t("clients360.filter_search", { defaultValue: "qidirish…" }) as string}
            options={optionsQ.data?.directions ?? []}
            value={directions}
            onChange={(v) => { setPage(0); setDirections(v); }}
          />

          <TrajectoryToggle value={trajectory} onChange={(v) => { setPage(0); setTrajectory(v); }} />

          <TogglePill
            active={hasOverdueDebt}
            onClick={() => { setPage(0); setHasOverdueDebt((v) => !v); }}
            icon={<AlertCircle className="h-3.5 w-3.5" />}
            label={t("clients360.filter_overdue", { defaultValue: "Qarz mavjud" }) as string}
            tone="destructive"
          />
          <TogglePill
            active={highRisk}
            onClick={() => { setPage(0); setHighRisk((v) => !v); }}
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            label={t("clients360.filter_high_risk", { defaultValue: "Yuqori xavf" }) as string}
            tone="amber"
          />

          <div className="ml-auto flex items-center gap-2">
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full bg-muted hover:bg-muted/70 text-foreground/80 text-[11px] uppercase tracking-[0.10em] transition-colors"
              >
                <X className="h-3 w-3" />
                {t("clients360.clear_filters", {
                  defaultValue: "Filtrlar ({{n}})",
                  n: activeFilterCount,
                })}
              </button>
            )}
            <SortSelect value={sort} onChange={(v) => { setPage(0); setSort(v); }} />
            <ScopeChip />
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────
          The table — composite-cell rows. Wrapped in a layered card so
          the toolbar above and the table read as separate strata.
      ────────────────────────────────────────────────────────────────────── */}
      <section className="stagger-3">
        <div className="bg-card border border-border/60 rounded-2xl shadow-soft p-3 md:p-4 relative">
          {isEmpty && !intelligenceQ.isLoading ? (
            <EmptyState
              hasFilters={personas.length > 0 || activeFilterCount > 0 || !!search.trim()}
              onClear={() => {
                clearPersonas();
                clearAllFilters();
                setSearch("");
              }}
            />
          ) : (
            <RankedTable<ClientRow>
              columns={columns}
              data={
                intelligenceQ.data
                  ? ({
                      rows: intelligenceQ.data.rows,
                      total: intelligenceQ.data.total,
                      page: intelligenceQ.data.page,
                      size: intelligenceQ.data.size,
                      sort,
                    } as Page<ClientRow>)
                  : undefined
              }
              loading={intelligenceQ.isLoading}
              onChange={(next) => {
                setPage(next.page);
                setSize(next.size);
                if (next.sort !== sort) setSort(next.sort);
                if (next.search !== search) {
                  setSearch(next.search);
                  setPage(0);
                }
              }}
              onRowClick={(r) => navigate(`/collection/debt/client/${r.person_id}`)}
              getRowKey={(r) => r.person_id}
              empty={t("clients360.empty", {
                defaultValue: "Tanlangan filtr bo'yicha mijoz topilmadi.",
              }) as string}
            />
          )}
        </div>
      </section>

      {contactDialog && (
        <QuickContactDialog
          open
          onClose={() => setContactDialog(null)}
          personId={contactDialog.id}
          personName={contactDialog.name}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cell helpers
// ---------------------------------------------------------------------------

function TierGlyph({ tier }: { tier: string }) {
  const tone =
    tier === "A" ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/40"
    : tier === "B" ? "bg-primary/10 text-primary border-primary/30"
    : tier === "C" ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40"
    :                "bg-destructive/10 text-destructive border-destructive/30";
  return (
    <span
      title={`Tier ${tier}`}
      className={cn(
        "shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-[3px] text-[9px] font-bold border leading-none",
        tone,
      )}
    >
      {tier}
    </span>
  );
}

function recencyTone(d: number | null | undefined) {
  if (d == null) return "text-muted-foreground";
  if (d <= 30) return "text-emerald-700 dark:text-emerald-400";
  if (d <= 90) return "text-foreground";
  if (d <= 180) return "text-amber-700 dark:text-amber-400";
  if (d <= 365) return "text-orange-700 dark:text-orange-400";
  return "text-destructive";
}

function TrajectoryLine({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const dead = 0.05;
  let glyph = "";
  let tone = "text-muted-foreground";
  if (pct > dead) { glyph = "▲"; tone = "text-emerald-700 dark:text-emerald-400"; }
  else if (pct < -dead) { glyph = "▼"; tone = "text-destructive"; }
  else { glyph = "—"; tone = "text-muted-foreground"; }
  const label = (pct >= 0 ? "+" : "") + Math.round(pct * 100) + "%";
  return (
    <div className={cn("mt-0.5 text-[10px] tabular-nums", tone)}>
      <span className="mr-0.5" aria-hidden>{glyph}</span>
      {label}
    </div>
  );
}

function formatShortDate(iso: string, lang: string) {
  // "2026-05-12" → "May 12" / "12 май" / "12 may"
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(5);
  return d.toLocaleDateString(
    lang === "ru" ? "ru-RU" : lang === "uz" ? "uz-UZ" : "en-US",
    { month: "short", day: "numeric" },
  );
}

function relativeDate(iso: string, lang: string, t: (k: string, opts?: any) => string) {
  // Shows "3k oldin" / "vchera" style relative — fall back to short date
  // beyond a week so the operator still sees something readable.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return t("clients360.today", { defaultValue: "Bugun" });
  if (days === 1) return t("clients360.yesterday", { defaultValue: "Kecha" });
  if (days <= 7) {
    return t("clients360.days_ago", {
      defaultValue: "{{n}}k oldin",
      n: days,
    });
  }
  return formatShortDate(iso, lang);
}

// ---------------------------------------------------------------------------
// Toolbar primitives
// ---------------------------------------------------------------------------

/**
 * Multi-select popover — shared shape across the manager/region/direction
 * filters. Trigger shows the label + a count chip when values are selected;
 * the popover holds a searchable list with checkmark indicators.
 */
function MultiPickPopover({
  label, placeholder, options, value, onChange,
}: {
  label: string;
  placeholder: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9 gap-2 rounded-full font-normal",
            value.length > 0
              ? "border-primary/50 text-foreground bg-primary/[0.04]"
              : "text-foreground/80",
          )}
        >
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </span>
          {value.length > 0 ? (
            <span className="font-mono tabular-nums text-[11px] text-primary">
              {value.length}
            </span>
          ) : (
            <ChevronsUpDown className="h-3 w-3 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>—</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const checked = value.includes(o);
                return (
                  <CommandItem key={o} onSelect={() => toggle(o)}>
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 text-primary",
                        checked ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="text-sm truncate">{o}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Three-state trajectory selector — growing / flat / declining / none. */
function TrajectoryToggle({
  value, onChange,
}: {
  value: Trajectory | "";
  onChange: (next: Trajectory | "") => void;
}) {
  const { t } = useTranslation();
  const items: { key: Trajectory; label: string; tone: string; glyph: string }[] = [
    { key: "growing",   label: t("clients360.traj_growing",   { defaultValue: "O'syapti" }) as string, tone: "text-emerald-700 dark:text-emerald-400", glyph: "▲" },
    { key: "flat",      label: t("clients360.traj_flat",      { defaultValue: "Tinch" })     as string, tone: "text-muted-foreground", glyph: "—" },
    { key: "declining", label: t("clients360.traj_declining", { defaultValue: "Pasayyapti" }) as string, tone: "text-destructive",      glyph: "▼" },
  ];
  return (
    <div className="inline-flex items-center h-9 rounded-full border border-border/60 bg-card overflow-hidden">
      <span className="px-3 text-[10px] uppercase tracking-[0.14em] text-muted-foreground border-r border-border/60">
        {t("clients360.filter_trajectory", { defaultValue: "Trayektoriya" })}
      </span>
      {items.map((i) => {
        const active = value === i.key;
        return (
          <button
            key={i.key}
            type="button"
            onClick={() => onChange(active ? "" : i.key)}
            className={cn(
              "h-9 px-2.5 text-[12px] flex items-center gap-1 transition-colors border-r border-border/60 last:border-r-0",
              active
                ? "bg-foreground text-background font-medium"
                : "hover:bg-muted/40",
              !active && i.tone,
            )}
            title={i.label}
            aria-pressed={active}
          >
            <span aria-hidden>{i.glyph}</span>
            <span className="hidden md:inline">{i.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Toggle pill — one-shot boolean filter, tone-tinted when active. */
function TogglePill({
  active, onClick, icon, label, tone,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tone: "destructive" | "amber" | "primary";
}) {
  const cls = active
    ? tone === "destructive"
      ? "bg-destructive/10 border-destructive/50 text-destructive"
      : tone === "amber"
        ? "bg-amber-500/10 border-amber-500/50 text-amber-800 dark:text-amber-300"
        : "bg-primary/10 border-primary/50 text-primary"
    : "bg-card border-border/60 text-foreground/80 hover:border-foreground/30";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-2 h-9 px-3 rounded-full border text-[12px] transition-all duration-150",
        active && "shadow-sm scale-[1.01]",
        cls,
      )}
    >
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  );
}

/** Sort dropdown — minimal native select styled to match the toolbar pills. */
function SortSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const opts: Array<{ key: string; label: string }> = [
    { key: "recency:asc",       label: t("clients360.sort_recency",      { defaultValue: "Eng yangi faollik" }) as string },
    { key: "recency:desc",      label: t("clients360.sort_recency_desc", { defaultValue: "Eng eski faollik" }) as string },
    { key: "ltv:desc",          label: t("clients360.sort_ltv",          { defaultValue: "LTV (yuqoridan)" }) as string },
    { key: "outstanding:desc",  label: t("clients360.sort_debt",         { defaultValue: "Qarz (ko'pdan)" }) as string },
    { key: "risk:desc",         label: t("clients360.sort_risk",         { defaultValue: "Xavf (yuqoridan)" }) as string },
    { key: "next_buy:desc",     label: t("clients360.sort_next_buy",     { defaultValue: "Sikldan kech qolgan" }) as string },
    { key: "last_contact:desc", label: t("clients360.sort_last_contact", { defaultValue: "Oxirgi aloqa (yangi)" }) as string },
    { key: "name:asc",          label: t("clients360.sort_name",         { defaultValue: "Nom (A-Z)" }) as string },
  ];
  return (
    <label className="inline-flex items-center h-9 rounded-full border border-border/60 bg-card pl-3 pr-1 gap-1.5">
      <Filter className="h-3 w-3 text-muted-foreground" />
      <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {t("clients360.sort_label", { defaultValue: "Saralash" })}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 bg-transparent text-[12px] focus:outline-none cursor-pointer"
      >
        {opts.map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({
  hasFilters, onClear,
}: {
  hasFilters: boolean;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="py-20 px-6 text-center">
      <div
        aria-hidden
        className="mx-auto w-12 h-12 rounded-full border-2 border-dashed border-border flex items-center justify-center font-display-italic text-primary text-2xl"
      >
        .
      </div>
      <div className="mt-5 font-display text-[18px] font-medium text-foreground">
        {hasFilters
          ? t("clients360.empty_filtered_title", { defaultValue: "Tanlangan filtr bo'yicha mijoz topilmadi" })
          : t("clients360.empty_title",         { defaultValue: "Hozircha mijozlar yo'q" })}
      </div>
      <div className="mt-2 text-[13px] text-muted-foreground max-w-[42ch] mx-auto leading-relaxed">
        {hasFilters
          ? t("clients360.empty_filtered_hint", { defaultValue: "Persona ribbon yoki filtrlardan biror narsani o'zgartiring." })
          : t("clients360.empty_hint",         { defaultValue: "ETL'dan ma'lumotlar kelishi bilan, ular shu yerda paydo bo'ladi." })}
      </div>
      {hasFilters && (
        <button
          type="button"
          onClick={onClear}
          className="mt-5 inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-primary text-primary-foreground text-[11px] uppercase tracking-[0.12em] hover:opacity-90 transition-opacity"
        >
          <X className="h-3 w-3" />
          {t("clients360.clear_all", { defaultValue: "Hammasini tozalash" })}
        </button>
      )}
    </div>
  );
}
