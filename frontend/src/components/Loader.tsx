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
        "py-10 text-center text-sm text-muted-foreground",
        kind === "error" && "text-destructive border-l-2 border-destructive pl-3",
        className,
      )}
    >
      {t(`common.${kind}`)}
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
            className="h-4"
            style={{ width: widths[i % widths.length] }}
          />
        ))}
      </div>
      <div className="pb-6 text-center text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    </div>
  );
}
