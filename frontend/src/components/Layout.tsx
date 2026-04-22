import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import MobileTopBar from "./MobileTopBar";

/**
 * Shell: sidebar on --paper-2 (cool pale stone), main on --paper (near-white).
 * The sidebar reads as a framing panel beside the airy content area. Depth
 * comes from paper-tone shift, not from a rule or shadow.
 *
 * On mobile (<md) the sidebar slides in over a backdrop; a compact top bar
 * carries the hamburger and language switch.
 */
export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const loc = useLocation();

  // Close the drawer on every route change.
  useEffect(() => {
    setMenuOpen(false);
  }, [loc.pathname]);

  // Lock body scroll while drawer is open on mobile.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen flex">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileTopBar onMenu={() => setMenuOpen(true)} />
        <main className="flex-1 bg-paper px-4 sm:px-6 md:px-10 lg:px-16 py-6 md:py-10">
          {/* Per-page components own their entrance via .stagger-N classes;
              the outer wrapper is no longer an animation layer. */}
          <div className="max-w-[1320px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
