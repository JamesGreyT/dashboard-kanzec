import { ReactNode } from "react";
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";

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
      <Breadcrumb>
        <BreadcrumbList>
          {crumb.map((c, i) => {
            const isLast = i === crumb.length - 1;
            return (
              <Fragment key={i}>
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage>{c}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink>{c}</BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!isLast && <BreadcrumbSeparator />}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground mt-3 leading-tight">
        {title}
      </h1>
      {subtitle && <div className="text-sm text-muted-foreground mt-2">{subtitle}</div>}
      <Separator className="mt-6" />
    </div>
  );
}
