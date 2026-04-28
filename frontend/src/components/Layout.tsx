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
      {/* Linen ambience — soft sage + terra blobs blurred behind everything,
          fixed so they don't scroll. Hidden in dark mode (the moss-ink bg
          doesn't need them and they read muddy). */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden dark:hidden">
        <div className="absolute -top-32 right-[-120px] w-[520px] h-[520px] rounded-full bg-[hsl(152,40%,58%)] opacity-22 blur-3xl" />
        <div className="absolute bottom-32 left-[-100px] w-[420px] h-[420px] rounded-full bg-[hsl(14,75%,62%)] opacity-15 blur-3xl" />
      </div>
      {/* WCAG 2.4.1 — skip link becomes visible on focus */}
      <a href="#main" className="sr-only-focusable">
        {t("a11y.skip_to_main", { defaultValue: "Skip to main content" })}
      </a>
      <Sidebar />
      <SidebarInset>
        <header className="md:hidden sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="text-base font-semibold">Kanzec</div>
        </header>
        <main
          id="main"
          role="main"
          aria-label={t("a11y.main_landmark", { defaultValue: "Main content" }) as string}
          className="flex-1 p-4 md:p-8 lg:p-10 outline-none"
        >
          <div className="max-w-[1320px] mx-auto">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
