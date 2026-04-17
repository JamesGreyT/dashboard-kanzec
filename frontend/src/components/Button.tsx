import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger" | "link";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-2 h-10 px-4 text-label font-medium rounded-[10px] transition-colors active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100";

const variants: Record<Variant, string> = {
  primary: "bg-mark text-[var(--paper)]",
  ghost: "bg-transparent text-ink-2 border border-rule hover:bg-paper-2 hover:text-ink",
  danger: "bg-transparent text-risk border border-rule hover:bg-risk-bg",
  // Text link — low-weight alternative to ghost for modal Cancel, etc.
  // Underline appears in --mark only on hover.
  link:
    "h-auto px-0 py-0 bg-transparent text-ink-2 hover:text-mark hover:underline decoration-mark underline-offset-[3px] border-0 font-normal text-label",
};

export default function Button({
  variant = "ghost",
  className = "",
  children,
  ...rest
}: Props) {
  return (
    <button {...rest} className={`${base} ${variants[variant]} ${className}`}>
      {variant === "primary" ? (
        <span className="primary-underline-sweep">{children}</span>
      ) : (
        children
      )}
    </button>
  );
}
