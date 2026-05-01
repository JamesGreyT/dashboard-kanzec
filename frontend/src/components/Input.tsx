import { InputHTMLAttributes, ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import { Input as ShadInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  leading?: ReactNode;
  layout?: "stacked" | "inline";
}

export default function Input({
  label,
  leading,
  layout = "stacked",
  className,
  type = "text",
  id,
  ...rest
}: Props) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";
  const effectiveType = isPassword && revealed ? "text" : type;
  const inputId = id ?? rest.name ?? undefined;

  const field = (
    <div className="relative flex items-center">
      {leading && (
        <span className="absolute left-3 text-ink3 pointer-events-none">
          {leading}
        </span>
      )}
      <ShadInput
        id={inputId}
        type={effectiveType}
        className={cn(
          "h-11 rounded-xl border-line bg-muted px-4 text-sm",
          "focus-visible:bg-card focus-visible:border-mint focus-visible:ring-4 focus-visible:ring-mint/15 focus-visible:ring-offset-0",
          "placeholder:text-ink4",
          leading && "pl-9",
          isPassword && "pr-10",
          className,
        )}
        {...rest}
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          className="absolute right-2 p-1 text-ink3 hover:text-ink transition-colors"
          aria-label={revealed ? t("common.hide_password") : t("common.show_password")}
          title={revealed ? t("common.hide_password") : t("common.show_password")}
        >
          {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
    </div>
  );

  if (layout === "inline" && label) {
    return (
      <div className="grid grid-cols-[100px_1fr] items-center gap-x-4">
        <Label htmlFor={inputId} className="text-right eyebrow">
          {label}
        </Label>
        {field}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <Label htmlFor={inputId} className="eyebrow">
          {label}
        </Label>
      )}
      {field}
    </div>
  );
}
