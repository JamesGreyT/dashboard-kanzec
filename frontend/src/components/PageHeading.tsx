import { ReactNode, Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

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
    <header className="stagger-0 relative pb-6 mb-6">
      <Breadcrumb className="mb-3">
        <BreadcrumbList className="eyebrow !tracking-[0.18em]">
          {crumb.map((c, i) => {
            const isLast = i === crumb.length - 1;
            return (
              <Fragment key={i}>
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage className="text-ink2">{c}</BreadcrumbPage>
                  ) : (
                    <span className="text-ink3">{c}</span>
                  )}
                </BreadcrumbItem>
                {!isLast && <BreadcrumbSeparator className="text-ink4" />}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="font-display text-4xl md:text-[44px] font-semibold leading-[1.04] tracking-[-0.04em] text-ink">
        {title}
      </h1>
      {subtitle && (
        <div className="mt-3 text-sm text-ink3 max-w-[62ch] leading-relaxed">
          {subtitle}
        </div>
      )}
    </header>
  );
}
