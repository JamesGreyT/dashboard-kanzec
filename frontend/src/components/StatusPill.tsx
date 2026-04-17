export type StatusTone = "live" | "staged" | "failed" | "quiet";

const MAP: Record<StatusTone, { bg: string; fg: string; dot: string; pulse: boolean }> = {
  live:   { bg: "bg-good-bg",  fg: "text-good",  dot: "bg-good",  pulse: true  },
  staged: { bg: "bg-warn-bg",  fg: "text-warn",  dot: "bg-warn",  pulse: false },
  failed: { bg: "bg-risk-bg",  fg: "text-risk",  dot: "bg-risk",  pulse: false },
  quiet:  { bg: "bg-quiet-bg", fg: "text-quiet", dot: "bg-quiet", pulse: false },
};

export default function StatusPill({
  tone,
  children,
  showDot = true,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  showDot?: boolean;
}) {
  const m = MAP[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full ${m.bg} ${m.fg} text-caption font-medium`}
    >
      {showDot && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${m.dot} ${m.pulse ? "animate-live-pulse" : ""}`}
        />
      )}
      {children}
    </span>
  );
}
