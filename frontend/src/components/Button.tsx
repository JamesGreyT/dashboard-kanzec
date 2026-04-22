import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger" | "link";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

// Shared shell — primary/ghost/danger share geometry; link overrides it.
const base =
  "inline-flex items-center justify-center gap-2 h-10 px-[18px] text-label font-semibold rounded-[10px] transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100";

const variants: Record<Variant, string> = {
  // Primary: solid orange with soft shadow that deepens on hover. Brightness
  // tweak (−5%) substitutes the old underline-sweep.
  primary:
    "bg-mark text-white shadow-btn hover:shadow-btn-hover hover:brightness-[0.95]",
  // Ghost: transparent with a double-hairline border that darkens on hover.
  ghost:
    "bg-transparent text-ink border border-rule-2 hover:border-ink hover:bg-card",
  // Danger: solid risk fill. Same geometry as primary.
  danger:
    "bg-risk text-white hover:brightness-[0.95]",
  // Link: editorial inline callout — italic Fraunces with an orange bottom
  // rule. Reads as prose, not chrome. Different geometry (auto height, no padding).
  link:
    "h-auto px-0 py-0 bg-transparent font-normal text-[15px] rounded-none " +
    "font-serif italic text-mark border-b border-mark-2 hover:border-mark " +
    "transition-colors duration-200",
};

export default function Button({
  variant = "ghost",
  className = "",
  children,
  ...rest
}: Props) {
  return (
    <button {...rest} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}
