import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import Sidebar from "./Sidebar";

export default function Layout() {
  const loc = useLocation();

  // No extra body-scroll lock needed — shadcn Sheet handles that for mobile
  // sidebar triggers. Still reset any residual state on navigation.
  useEffect(() => {
    // no-op; placeholder for route-change side effects.
  }, [loc.pathname]);

  return (
    <SidebarProvider>
      <Sidebar />
      <SidebarInset>
        <header className="md:hidden sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="text-base font-semibold">Kanzec</div>
        </header>
        <main className="flex-1 p-4 md:p-8 lg:p-10">
          <div className="max-w-[1320px] mx-auto">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
