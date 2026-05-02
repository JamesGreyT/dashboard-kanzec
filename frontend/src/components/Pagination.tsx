import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Pagination({
  offset,
  limit,
  total,
  onOffset,
}: {
  offset: number;
  limit: number;
  total: number;
  onOffset: (o: number) => void;
}) {
  const { t } = useTranslation();
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  const pages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.floor(offset / limit) + 1;
  const canPrev = offset > 0;
  const canNext = offset + limit < total;
  const showJump = pages > 5;

  const [jumpDraft, setJumpDraft] = useState<string>("");
  const submitJump = (e: FormEvent) => {
    e.preventDefault();
    const n = parseInt(jumpDraft, 10);
    if (!Number.isFinite(n) || n < 1 || n > pages) return;
    onOffset((n - 1) * limit);
    setJumpDraft("");
  };

  return (
    <div className="h-14 px-6 flex items-center justify-between gap-6 border-t">
      <div className="text-xs text-muted-foreground tabular-nums">
        {t("common.showing_range", {
          from: from.toLocaleString(),
          to: to.toLocaleString(),
          total: total.toLocaleString(),
        })}
      </div>
      <div className="flex items-center gap-4">
        {showJump && (
          <form
            onSubmit={submitJump}
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <span>{currentPage} /</span>
            <Input
              value={jumpDraft}
              onChange={(e) => setJumpDraft(e.target.value.replace(/\D/g, ""))}
              className="w-14 h-8 text-center tabular-nums"
              placeholder={String(pages)}
              aria-label="Jump to page"
            />
          </form>
        )}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOffset(Math.max(0, offset - limit))}
            disabled={!canPrev}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {t("common.prev")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOffset(offset + limit)}
            disabled={!canNext}
          >
            {t("common.next")}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
