import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

/**
 * Shell: sidebar on --paper, main on --paper-2. Depth comes from paper-tone
 * shift, not from a rule or shadow.
 */
export default function Layout() {
  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 bg-paper-2 px-10 lg:px-16 py-10">
        <div className="max-w-[1320px] mx-auto animate-enter-up">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
