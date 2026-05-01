import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type PhraseKind =
  | "loading"
  | "empty"
  | "filtered"
  | "error"
  | "no_dispatches"
  | "awaiting_wire";

export function Phrase({
  kind = "loading",
  className = "",
}: {
  kind?: PhraseKind;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "py-10 text-center text-sm text-ink3 flex flex-col items-center gap-3",
        kind === "error" && "text-coraldk border-l-2 border-coral pl-3",
        className,
      )}
    >
      {kind === "loading" && <MintDotTrio />}
      <span>{t(`common.${kind}`)}</span>
    </div>
  );
}

/** Three mint dots that pulse in sequence — Mobile Card Stream loader. */
function MintDotTrio() {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      <span className="block w-2 h-2 rounded-full bg-mint animate-pulsemint" style={{ animationDelay: "0ms" }} />
      <span className="block w-2 h-2 rounded-full bg-mint animate-pulsemint" style={{ animationDelay: "200ms" }} />
      <span className="block w-2 h-2 rounded-full bg-mint animate-pulsemint" style={{ animationDelay: "400ms" }} />
    </div>
  );
}

export function RuledLoader({ rows = 7 }: { rows?: number }) {
  const { t } = useTranslation();
  const widths = ["72%", "54%", "86%", "46%", "62%", "78%", "40%"];
  return (
    <div>
      <div className="px-6 py-6 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-4 bg-line"
            style={{ width: widths[i % widths.length] }}
          />
        ))}
      </div>
      <div className="pb-6 flex items-center justify-center gap-3 text-sm text-ink3">
        <MintDotTrio />
        <span>{t("common.loading")}</span>
      </div>
    </div>
  );
}
