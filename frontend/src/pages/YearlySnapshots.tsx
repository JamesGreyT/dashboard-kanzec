import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, Loader2 } from "lucide-react";

import { api } from "../lib/api";
import PageHeading from "../components/PageHeading";
import PivotTable, { PivotRow } from "../components/PivotTable";
import DirectionMultiSelect from "../components/DirectionMultiSelect";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface PairTable {
  rows: Array<{ label: string; sotuv: number[]; kirim: number[] }>;
  total_sotuv: number[];
  total_kirim: number[];
}
interface BrandTable {
  rows: Array<{ label: string; sotuv: number[] }>;
  total_brand: number[];
  total_sold: number[];
}
interface YearlyResponse {
  fiscal_ends: string[];
  filter: { direction: string[] };
  tables: {
    managers: PairTable;
    aging: PairTable;
    directions: PairTable;
    regions: PairTable;
    brands: BrandTable;
  };
}

/**
 * Picks a sensible default end_year: FY ends 31 March, so after 1 April
 * we've rolled into the next FY.
 */
function defaultEndYear(): number {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() + 1 : now.getFullYear();
}

function splitPair(
  data: PairTable,
): { sotuv: PivotRow[]; kirim: PivotRow[] } {
  const sotuv = data.rows
    .filter((r) => r.sotuv.some((v) => v !== 0))
    .map((r) => ({ label: r.label, values: r.sotuv }));
  const kirim = data.rows
    .filter((r) => r.kirim.some((v) => v !== 0))
    .map((r) => ({ label: r.label, values: r.kirim }));
  return { sotuv, kirim };
}

export default function YearlySnapshots() {
  const { t } = useTranslation();

  const [endYear, setEndYear] = useState<number>(defaultEndYear());
  const [years, setYears] = useState<number>(4);
  const [directionFilter, setDirectionFilter] = useState<string[]>([]);
  const [compact, setCompact] = useState<boolean>(false);

  // Directions catalog (for the filter chips)
  const dirsQ = useQuery({
    queryKey: ["snapshots.directions"],
    queryFn: () =>
      api<{ directions: string[] }>("/api/snapshots/directions"),
    staleTime: 5 * 60_000,
  });

  const queryString = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("end_year", String(endYear));
    qs.set("years", String(years));
    if (directionFilter.length) qs.set("direction", directionFilter.join(","));
    return qs.toString();
  }, [endYear, years, directionFilter]);

  const dataQ = useQuery({
    queryKey: ["snapshots.yearly", queryString],
    queryFn: () =>
      api<YearlyResponse>(`/api/snapshots/yearly?${queryString}`),
    staleTime: 30_000,
  });

  const today = new Date();
  const possibleEndYears: number[] = [];
  for (let y = today.getFullYear() + 1; y >= 2023; y--) possibleEndYears.push(y);

  if (dataQ.isError) {
    return (
      <div>
        <PageHeading
          crumb={[t("nav.analytics"), t("nav.yearly")]}
          title={t("yearly.title")}
          subtitle={t("yearly.subtitle")}
        />
        <div className="mt-6 caption text-red-700 dark:text-red-400 border-l-2 border-red-500 pl-3">
          {(dataQ.error as Error).message}
        </div>
      </div>
    );
  }

  const data = dataQ.data;
  const years_iso = data?.fiscal_ends ?? [];

  return (
    <div>
      <PageHeading
        crumb={[t("nav.analytics"), t("nav.yearly")]}
        title={t("yearly.title")}
        subtitle={t("yearly.subtitle")}
      />

      {/* Filter bar */}
      <div className="stagger-1 flex flex-wrap items-center gap-4 mb-10">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-[0.1em] text-muted-foreground font-medium">
            {t("yearly.filter_end_year")}
          </span>
          <Select
            value={String(endYear)}
            onValueChange={(v) => setEndYear(Number(v))}
          >
            <SelectTrigger className="h-9 w-[108px]">
              <div className="flex items-center gap-1.5">
                <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              {possibleEndYears.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-[0.1em] text-muted-foreground font-medium">
            {t("yearly.filter_years")}
          </span>
          <div className="flex rounded-md border border-input overflow-hidden">
            {[2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                onClick={() => setYears(n)}
                className={
                  "px-3 h-9 text-[13px] tabular-nums transition " +
                  (years === n
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground/80 hover:bg-muted")
                }
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <DirectionMultiSelect
          options={dirsQ.data?.directions ?? []}
          value={directionFilter}
          onChange={setDirectionFilter}
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setCompact((c) => !c)}
          >
            {compact ? t("yearly.full_digits") : t("yearly.compact_digits")}
          </Button>
          {dataQ.isFetching && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      {!data ? (
        <div className="space-y-14">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`stagger-${i} space-y-3 animate-pulse`}
            >
              <div className="h-3 w-40 bg-muted rounded" />
              <div className="h-48 bg-muted/40 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <section className="space-y-16">
          {/* 1. Managers (B2B) */}
          <TablePairBlock
            eyebrowPrefix="B2B · SOTUVCHI MENEJERLAR"
            titleKey="yearly.tbl.managers"
            scopeNote={t("yearly.scope_b2b") as string}
            pair={data.tables.managers}
            years={years_iso}
            compact={compact}
          />
          {/* 2. Aging buckets (B2B) */}
          <TablePairBlock
            eyebrowPrefix="B2B · FAOLIYAT OYNASI"
            titleKey="yearly.tbl.aging"
            scopeNote={t("yearly.scope_b2b") as string}
            pair={data.tables.aging}
            years={years_iso}
            compact={compact}
          />
          {/* 3. Directions */}
          <TablePairBlock
            eyebrowPrefix="YO'NALISH BO'YICHA"
            titleKey="yearly.tbl.directions"
            scopeNote={
              directionFilter.length
                ? directionFilter.join(" · ")
                : (t("yearly.scope_all") as string)
            }
            pair={data.tables.directions}
            years={years_iso}
            compact={compact}
          />
          {/* 4. Regions */}
          <TablePairBlock
            eyebrowPrefix="HUDUD BO'YICHA"
            titleKey="yearly.tbl.regions"
            scopeNote={
              directionFilter.length
                ? directionFilter.join(" · ")
                : (t("yearly.scope_all") as string)
            }
            pair={data.tables.regions}
            years={years_iso}
            compact={compact}
          />
          {/* 5. Brand (single — Sotuv only) */}
          <BrandBlock
            titleKey="yearly.tbl.brands"
            scopeNote={
              directionFilter.length
                ? directionFilter.join(" · ")
                : (t("yearly.scope_all") as string)
            }
            brands={data.tables.brands}
            years={years_iso}
            compact={compact}
          />
        </section>
      )}

      <div className="mt-16 text-[11px] text-muted-foreground italic max-w-[62ch] leading-relaxed">
        {t("yearly.footer_note")}
      </div>
    </div>
  );
}

function TablePairBlock({
  eyebrowPrefix,
  titleKey,
  scopeNote,
  pair,
  years,
  compact,
}: {
  eyebrowPrefix: string;
  titleKey: string;
  scopeNote: string;
  pair: PairTable;
  years: string[];
  compact: boolean;
}) {
  const { t } = useTranslation();
  const { sotuv, kirim } = splitPair(pair);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="font-display text-[22px] md:text-[26px] font-medium tracking-[-0.01em] text-foreground">
          {t(titleKey)}
          <span
            aria-hidden
            className="font-display-italic text-primary ml-[2px]"
          >
            .
          </span>
        </h2>
        <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {scopeNote}
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-12 gap-y-10">
        <PivotTable
          eyebrow={`SOTUV · ${eyebrowPrefix}`}
          rows={sotuv}
          totalLabel={t("yearly.jami") as string}
          totals={pair.total_sotuv}
          years={years}
          compact={compact}
        />
        <PivotTable
          eyebrow={`KIRIM · ${eyebrowPrefix}`}
          rows={kirim}
          totalLabel={t("yearly.jami") as string}
          totals={pair.total_kirim}
          years={years}
          compact={compact}
        />
      </div>
      <hr className="mark-rule mt-12" aria-hidden />
    </div>
  );
}

function BrandBlock({
  titleKey,
  scopeNote,
  brands,
  years,
  compact,
}: {
  titleKey: string;
  scopeNote: string;
  brands: BrandTable;
  years: string[];
  compact: boolean;
}) {
  const { t } = useTranslation();
  const rows = brands.rows
    .filter((r) => r.sotuv.some((v) => v !== 0))
    .map((r) => ({ label: r.label, values: r.sotuv }));
  return (
    <div>
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="font-display text-[22px] md:text-[26px] font-medium tracking-[-0.01em] text-foreground">
          {t(titleKey)}
          <span
            aria-hidden
            className="font-display-italic text-primary ml-[2px]"
          >
            .
          </span>
        </h2>
        <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {scopeNote}
        </div>
      </div>
      <div className="max-w-[620px]">
        <PivotTable
          eyebrow="SOTUV · MARKA BO'YICHA"
          rows={rows}
          totalLabel={t("yearly.jami_produce") as string}
          totals={brands.total_brand}
          extraTotalLabel={t("yearly.jami_sold") as string}
          extraTotals={brands.total_sold}
          years={years}
          compact={compact}
        />
      </div>
    </div>
  );
}
