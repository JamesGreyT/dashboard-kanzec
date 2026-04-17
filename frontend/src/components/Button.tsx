import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const base = "inline-flex items-center justify-center gap-2 h-10 px-4 text-label font-medium rounded-[10px] transition-colors active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100";

const variants: Record<Variant, string> = {
  primary:
    "bg-mark text-[var(--paper)] hover:bg-[color-mix(in_srgb,var(--mark)_94%,#000_6%)]",
  ghost:
    "bg-transparent text-ink-2 border border-rule hover:bg-paper-2 hover:text-ink",
  danger:
    "bg-transparent text-risk border border-rule hover:bg-risk-bg",
};

export default function Button({ variant = "ghost", className = "", ...rest }: Props) {
  return <button {...rest} className={`${base} ${variants[variant]} ${className}`} />;
}
