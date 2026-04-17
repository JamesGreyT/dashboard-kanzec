import { useEffect, useState } from "react";

function rel(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (isNaN(diff)) return "—";
  if (diff < 5) return "just now";
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

export default function RelativeTime({ iso }: { iso: string | null | undefined }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return <span className="text-ink-3">—</span>;
  const absolute = new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Tashkent" });
  return (
    <span title={absolute} className="tabular-nums">
      {rel(iso)}
    </span>
  );
}
