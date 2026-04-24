import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

/**
 * Multi-select popover for direction filter.
 * - Empty value = show all directions (pill text: "Barchasi")
 * - Non-empty = chip list on trigger, with × to clear each
 */
export default function DirectionMultiSelect({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  };

  return (
    <div className="flex items-center gap-2 min-h-[36px] flex-wrap">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            size="sm"
            className="h-9 gap-2 justify-between min-w-[160px] font-normal"
          >
            <span className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
              {t("yearly.filter_direction")}
            </span>
            <ChevronsUpDown className="h-3 w-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-0" align="start">
          <Command>
            <CommandInput placeholder={t("yearly.filter_search") as string} />
            <CommandList>
              <CommandEmpty>{t("yearly.filter_empty")}</CommandEmpty>
              <CommandGroup>
                {options.map((o) => {
                  const checked = value.includes(o);
                  return (
                    <CommandItem key={o} onSelect={() => toggle(o)}>
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 text-primary",
                          checked ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="text-sm">{o}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value.length === 0 ? (
        <span className="text-[12px] italic text-muted-foreground">
          {t("yearly.filter_all")}
        </span>
      ) : (
        value.map((v) => (
          <button
            key={v}
            onClick={() => onChange(value.filter((x) => x !== v))}
            className="group flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[12px] font-medium hover:bg-primary/20 transition"
          >
            <span>{v}</span>
            <X className="h-3 w-3 opacity-50 group-hover:opacity-100" />
          </button>
        ))
      )}
    </div>
  );
}
