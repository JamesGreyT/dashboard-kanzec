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
      <Breadcrumb className="mb-4">
        <BreadcrumbList className="text-xs eyebrow !tracking-[0.18em]">
          {crumb.map((c, i) => {
            const isLast = i === crumb.length - 1;
            return (
              <Fragment key={i}>
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage className="text-foreground/80">
                      {c}
                    </BreadcrumbPage>
                  ) : (
                    <span className="text-muted-foreground">{c}</span>
                  )}
                </BreadcrumbItem>
                {!isLast && <BreadcrumbSeparator className="opacity-50" />}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="font-display text-4xl md:text-5xl font-medium leading-[1.04] tracking-[-0.015em] text-foreground">
        {title}
        <span
          aria-hidden
          className="font-display-italic text-primary ml-[2px]"
        >
          .
        </span>
      </h1>
      {subtitle && (
        <div className="mt-3 text-sm text-muted-foreground max-w-[62ch] leading-relaxed">
          {subtitle}
        </div>
      )}
      <div className="mark-rule absolute bottom-0 left-0 right-0" aria-hidden />
    </header>
  );
}
