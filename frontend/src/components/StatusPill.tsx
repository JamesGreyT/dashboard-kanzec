import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTone = "live" | "staged" | "failed" | "quiet";

const toneClass: Record<StatusTone, string> = {
  live: "bg-mintbg text-mintdk border-transparent hover:bg-mintbg",
  staged: "bg-amberbg text-amber border-transparent hover:bg-amberbg",
  failed: "bg-coralbg text-coraldk border-transparent hover:bg-coralbg",
  quiet: "bg-line text-ink3 border-transparent hover:bg-line",
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
    <Badge className={cn("gap-1.5 font-mono font-medium tracking-tight rounded-full uppercase text-[10px]", toneClass[tone])}>
      <span
        aria-hidden
        className={cn(
          "block w-1.5 h-1.5 rounded-full bg-current shrink-0",
          tone === "live" && pulse && "animate-pulsemint",
        )}
      />
      {children}
    </Badge>
  );
}
