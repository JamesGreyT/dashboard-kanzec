import { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const trendToneClass: Record<"good" | "risk" | "quiet", string> = {
  good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-transparent",
  risk: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-transparent",
  quiet: "bg-muted text-muted-foreground border-transparent",
};

export default function StatCard({
  label,
  value,
  unit,
  trend,
  children,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  trend?: { tone: "good" | "risk" | "quiet"; arrow?: string; text: string };
  children?: ReactNode;
}) {
  return (
    <Card className="min-h-[168px] flex flex-col">
      <CardContent className="flex-1 flex flex-col pt-6">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </div>
        <div className="flex-1 flex flex-col justify-end items-end mt-4">
          <div className="text-4xl font-semibold text-foreground leading-none tabular-nums">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={String(value)}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.26, ease: [0.2, 0.85, 0.25, 1] }}
                className="inline-block"
              >
                {value}
              </motion.span>
            </AnimatePresence>
          </div>
          {unit && <div className="text-sm text-muted-foreground mt-1">{unit}</div>}
          {trend && (
            <Badge className={cn("mt-3 gap-1 tabular-nums", trendToneClass[trend.tone])}>
              {trend.arrow && <span>{trend.arrow}</span>}
              <span>{trend.text}</span>
            </Badge>
          )}
          {children}
        </div>
      </CardContent>
    </Card>
  );
}
