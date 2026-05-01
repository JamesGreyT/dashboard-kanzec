import { Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import LangToggle from "./LangToggle";

export default function MobileTopBar({ onMenu }: { onMenu: () => void }) {
  const { t } = useTranslation();
  return (
    <header className="md:hidden sticky top-0 z-40 h-14 bg-card/90 backdrop-blur border-b border-line flex items-center justify-between px-4">
      <Button
        variant="ghost"
        size="icon"
        onClick={onMenu}
        aria-label="Open menu"
        className="text-ink2 hover:text-ink"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <div className="font-display text-lg font-semibold tracking-[-0.03em] text-ink">
        {t("common.app")}
      </div>
      <LangToggle />
    </header>
  );
}
