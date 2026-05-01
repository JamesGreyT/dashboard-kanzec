import { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const trendToneClass: Record<"good" | "risk" | "quiet", string> = {
  good: "bg-mintbg text-mintdk border-transparent hover:bg-mintbg",
  risk: "bg-coralbg text-coraldk border-transparent hover:bg-coralbg",
  quiet: "bg-line text-ink3 border-transparent hover:bg-line",
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
    <Card className="min-h-[168px] flex flex-col bg-card border-line rounded-2xl shadow-card">
      <CardContent className="flex-1 flex flex-col pt-6">
        <div className="eyebrow">{label}</div>
        <div className="flex-1 flex flex-col justify-end items-end mt-4">
          <div className="kpi-num text-[40px] text-ink">
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
          {unit && <div className="text-sm text-ink3 mt-1">{unit}</div>}
          {trend && (
            <Badge className={cn("mt-3 gap-1 font-mono tabular-nums rounded-full", trendToneClass[trend.tone])}>
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
