import { useTranslation } from "react-i18next";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type Role = "admin" | "operator" | "viewer";

const tone: Record<Role, string> = {
  admin:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-transparent",
  operator:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-transparent",
  viewer: "bg-muted text-muted-foreground border-transparent",
};

const OPTIONS: Role[] = ["viewer", "operator", "admin"];

export default function RolePicker({
  value,
  onChange,
  disabled,
}: {
  value: Role;
  onChange: (r: Role) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button variant="ghost" size="sm" className="h-auto px-0 hover:bg-transparent">
          <Badge className={cn("gap-1 font-medium", tone[value])}>
            {t(`roles.${value}`)}
            <ChevronDown className="h-3 w-3 opacity-70" />
          </Badge>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[180px]">
        {OPTIONS.map((o) => (
          <DropdownMenuItem
            key={o}
            onClick={() => onChange(o)}
            className="gap-3"
          >
            <Badge className={cn("font-medium", tone[o])}>{t(`roles.${o}`)}</Badge>
            {o === value && <Check className="ml-auto h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
