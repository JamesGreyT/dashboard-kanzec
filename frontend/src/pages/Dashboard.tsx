import { useAuth } from "../lib/auth";

/**
 * Phase B stub. Real KPIs, chart, and worker-health rows land in Phase D.
 * Kept here to prove the Almanac chrome renders end-to-end after login.
 */
export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div>
      <div className="caption text-ink-3">Dashboard · Overview</div>
      <h1 className="serif text-heading-lg text-ink mt-2">
        Dashboard<span className="text-mark">.</span>
      </h1>
      <p className="text-body text-ink-2 mt-3">
        Signed in as <span className="serif-italic text-ink">{user.username}</span>{" "}
        — role <span className="eyebrow">{user.role}</span>.
      </p>

      <div className="rule mt-6" />

      <div className="mt-10 p-8 bg-card rounded-card shadow-card">
        <div className="eyebrow">today · placeholder</div>
        <div className="mt-4 flex items-end justify-between">
          <div className="serif nums text-stat-xl text-ink leading-none">418</div>
          <div className="serif-italic text-ink-2 text-body">
            ↗ +14 from yesterday
          </div>
        </div>
        <div className="mt-2 caption text-ink-3">orders</div>
        <p className="text-body text-ink-2 mt-8">
          This panel is a placeholder to verify the Almanac typography + palette
          render correctly on the deployed build. Dashboard KPIs wire in at
          Phase D — see{" "}
          <a href="https://github.com/JamesGreyT/dashboard-kanzec">repo</a>.
        </p>
      </div>
    </div>
  );
}
