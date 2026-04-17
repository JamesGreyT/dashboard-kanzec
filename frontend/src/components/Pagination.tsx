import { FormEvent, useState } from "react";

/**
 * Pagination strip rendered inside a card's bottom rule.
 *   showing 231–280 of 68,851           ‹ prev   next ›
 *                                       page [   3  ] of 1,378   (appears if pages > 5)
 */
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
    <div className="h-14 px-6 flex items-center justify-between gap-6 border-t border-rule">
      <div className="caption text-ink-3 tabular-nums">
        showing {from.toLocaleString()}–{to.toLocaleString()} of{" "}
        {total.toLocaleString()}
      </div>
      <div className="flex items-center gap-6">
        {showJump && (
          <form onSubmit={submitJump} className="flex items-center gap-2 caption text-ink-3">
            <span>page</span>
            <input
              value={jumpDraft}
              onChange={(e) => setJumpDraft(e.target.value.replace(/\D/g, ""))}
              className="w-12 h-7 bg-paper-2 rounded-[6px] px-2 mono text-mono-sm text-ink text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-mark/35"
              placeholder={String(currentPage)}
              aria-label="Jump to page"
            />
            <span>of {pages.toLocaleString()}</span>
          </form>
        )}
        <div className="flex items-center gap-6 text-label">
          <button
            onClick={() => onOffset(Math.max(0, offset - limit))}
            disabled={!canPrev}
            className="text-ink hover:text-mark hover:underline decoration-mark underline-offset-[3px] disabled:text-ink-3 disabled:no-underline disabled:cursor-not-allowed"
          >
            ‹ prev
          </button>
          <button
            onClick={() => onOffset(offset + limit)}
            disabled={!canNext}
            className="text-ink hover:text-mark hover:underline decoration-mark underline-offset-[3px] disabled:text-ink-3 disabled:no-underline disabled:cursor-not-allowed"
          >
            next ›
          </button>
        </div>
      </div>
    </div>
  );
}
