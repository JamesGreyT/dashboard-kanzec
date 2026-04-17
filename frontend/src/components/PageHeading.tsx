import { ReactNode } from "react";

export default function PageHeading({
  crumb,
  title,
  subtitle,
}: {
  crumb: string[];
  title: string;
  subtitle?: ReactNode;
}) {
  return (
    <div>
      <div className="caption text-ink-3">
        {crumb.map((c, i) => (
          <span key={i}>
            {i > 0 && <span className="mx-2">·</span>}
            <span className={i === crumb.length - 1 ? "text-ink-2" : ""}>{c}</span>
          </span>
        ))}
      </div>
      <h1 className="serif text-heading-lg text-ink mt-2 leading-none">
        {title}
        <span className="mark-stop">.</span>
      </h1>
      {subtitle && (
        <div className="text-body text-ink-2 mt-3">{subtitle}</div>
      )}
      <div className="leader mt-6" />
    </div>
  );
}
