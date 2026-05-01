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
  admin: "bg-mintbg text-mintdk border-transparent hover:bg-mintbg",
  operator: "bg-amberbg text-amber border-transparent hover:bg-amberbg",
  viewer: "bg-line text-ink3 border-transparent hover:bg-line",
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
          <Badge className={cn("gap-1 font-mono uppercase text-[10px] rounded-full", tone[value])}>
            {t(`roles.${value}`)}
            <ChevronDown className="h-3 w-3 opacity-70" />
          </Badge>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[180px] rounded-xl shadow-cardlg border-line">
        {OPTIONS.map((o) => (
          <DropdownMenuItem
            key={o}
            onClick={() => onChange(o)}
            className="gap-3 rounded-lg"
          >
            <Badge className={cn("font-mono uppercase text-[10px] rounded-full", tone[o])}>{t(`roles.${o}`)}</Badge>
            {o === value && <Check className="ml-auto h-4 w-4 text-mint" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
