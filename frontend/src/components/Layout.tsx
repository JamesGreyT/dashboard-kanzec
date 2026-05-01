import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import Sidebar from "./Sidebar";

export default function Layout() {
  const loc = useLocation();
  const { t, i18n } = useTranslation();

  // Keep <html lang> synced with the active i18n language (WCAG 3.1.1).
  useEffect(() => {
    const lang = i18n.language?.split("-")[0] ?? "en";
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, [i18n.language]);

  useEffect(() => {
    // Reset focus to <main> on route change so screen readers announce
    // the new page and keyboard users don't remain parked mid-sidebar.
    const main = document.getElementById("main");
    if (main) {
      main.setAttribute("tabindex", "-1");
      main.focus({ preventScroll: true });
    }
  }, [loc.pathname]);

  return (
    <SidebarProvider>
      {/* WCAG 2.4.1 — skip link becomes visible on focus */}
      <a href="#main" className="sr-only-focusable">
        {t("a11y.skip_to_main", { defaultValue: "Skip to main content" })}
      </a>
      <Sidebar />
      <SidebarInset className="page-bg grain">
        <header className="md:hidden sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-card/90 backdrop-blur px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="font-display text-lg font-semibold tracking-[-0.03em] text-ink">
            Kanzec
          </div>
        </header>
        <main
          id="main"
          role="main"
          aria-label={t("a11y.main_landmark", { defaultValue: "Main content" }) as string}
          className="flex-1 p-4 md:p-8 lg:p-10 outline-none relative z-[1]"
        >
          <div className="max-w-[1320px] mx-auto">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
