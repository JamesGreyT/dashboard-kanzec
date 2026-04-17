import { InputHTMLAttributes, ReactNode } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  leading?: ReactNode;
  /** "stacked" — label above (default, used in Login / simple fields).
   *  "inline" — label as margin-note (80px right-aligned) to the left,
   *  used in modals + filters so forms read as typeset captions. */
  layout?: "stacked" | "inline";
}

export default function Input({
  label,
  leading,
  layout = "stacked",
  className = "",
  ...rest
}: Props) {
  const field = (
    <div className="flex items-center gap-2 h-10 bg-paper-2 px-3 rounded-[10px] focus-within:ring-2 focus-within:ring-mark/35">
      {leading && <span className="text-ink-3">{leading}</span>}
      <input
        {...rest}
        className={`flex-1 bg-transparent text-body text-ink border-0 outline-none placeholder:italic placeholder:text-ink-3 min-w-0 ${className}`}
      />
    </div>
  );

  if (layout === "inline" && label) {
    return (
      <label className="grid grid-cols-[100px_1fr] items-center gap-x-4">
        <span className="eyebrow text-right">{label}</span>
        {field}
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-2">
      {label && <span className="eyebrow">{label}</span>}
      {field}
    </label>
  );
}
