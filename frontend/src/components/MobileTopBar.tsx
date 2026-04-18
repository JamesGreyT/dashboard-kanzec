import { Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import LangToggle from "./LangToggle";

/**
 * Sticky top strip shown only on <md widths. Mirrors the Sidebar's editorial
 * voice: paper background, hairline below, serif-italic wordmark, one
 * hamburger, language switch at the far right.
 */
export default function MobileTopBar({ onMenu }: { onMenu: () => void }) {
  const { t } = useTranslation();
  return (
    <header
      className="md:hidden sticky top-0 z-40 h-14 bg-paper border-b border-rule
                 flex items-center justify-between px-4"
    >
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open menu"
        className="w-10 h-10 -ml-2 flex items-center justify-center text-ink-2 hover:text-mark transition-colors"
      >
        <Menu size={22} strokeWidth={1.5} />
      </button>
      <div className="serif-italic text-[17px] text-ink leading-none">
        {t("common.app")}
      </div>
      <LangToggle />
    </header>
  );
}
