import { InputHTMLAttributes, ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

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
  type = "text",
  ...rest
}: Props) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";
  const effectiveType = isPassword && revealed ? "text" : type;

  const field = (
    <div className="flex items-center gap-2 h-10 bg-card px-3 rounded-[10px] border border-rule-2 transition-colors focus-within:border-mark focus-within:ring-2 focus-within:ring-mark/30 hover:border-ink-3">
      {leading && <span className="text-ink-3">{leading}</span>}
      <input
        {...rest}
        type={effectiveType}
        className={`flex-1 bg-transparent text-body text-ink border-0 outline-none placeholder:italic placeholder:text-ink-3 min-w-0 ${className}`}
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          className="shrink-0 text-ink-3 hover:text-mark transition-colors"
          aria-label={revealed ? t("common.hide_password") : t("common.show_password")}
          title={revealed ? t("common.hide_password") : t("common.show_password")}
        >
          {revealed ? <EyeOff /> : <Eye />}
        </button>
      )}
    </div>
  );

  if (layout === "inline" && label) {
    return (
      <label className="grid grid-cols-[100px_1fr] items-center gap-x-4">
        <span className="eyebrow-mono text-right">{label}</span>
        {field}
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-2">
      {label && <span className="eyebrow-mono">{label}</span>}
      {field}
    </label>
  );
}

function Eye() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 3l18 18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M10.6 6.15A9.9 9.9 0 0 1 12 6c6.5 0 10 6 10 6a17.2 17.2 0 0 1-3.3 3.9M6.1 6.1C3 8 2 12 2 12s3.5 7 10 7c2 0 3.7-.7 5.1-1.7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 9.7a3 3 0 0 0 4.8 4.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
