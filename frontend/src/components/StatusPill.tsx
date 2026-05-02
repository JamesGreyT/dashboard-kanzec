import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTone = "live" | "staged" | "failed" | "quiet";

const toneClass: Record<StatusTone, string> = {
  live: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-transparent hover:bg-emerald-100",
  staged: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-transparent hover:bg-amber-100",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-transparent hover:bg-red-100",
  quiet: "bg-muted text-muted-foreground border-transparent hover:bg-muted",
};

export default function StatusPill({
  tone,
  children,
  pulse = false,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  pulse?: boolean;
}) {
  return (
    <Badge className={cn("gap-1.5 font-normal", toneClass[tone])}>
      <span
        aria-hidden
        className={cn(
          "block w-1.5 h-1.5 rounded-full bg-current shrink-0",
          tone === "live" && pulse && "animate-pulse",
        )}
      />
      {children}
    </Badge>
  );
}
