import { Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import LangToggle from "./LangToggle";

export default function MobileTopBar({ onMenu }: { onMenu: () => void }) {
  const { t } = useTranslation();
  return (
    <header className="md:hidden sticky top-0 z-40 h-14 bg-background border-b flex items-center justify-between px-4">
      <Button
        variant="ghost"
        size="icon"
        onClick={onMenu}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <div className="text-base font-semibold text-foreground">
        {t("common.app")}
      </div>
      <LangToggle />
    </header>
  );
}
