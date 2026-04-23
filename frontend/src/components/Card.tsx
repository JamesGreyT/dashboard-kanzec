import { ReactNode } from "react";
import {
  Card as ShadCard,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function Card({
  children,
  accent,
  className,
  eyebrow,
  title,
  interactive,
}: {
  children: ReactNode;
  accent?: boolean;
  className?: string;
  eyebrow?: string;
  title?: string;
  interactive?: boolean;
}) {
  const hasHeader = !!(eyebrow || title);
  return (
    <ShadCard
      className={cn(
        accent && "border-l-4 border-l-primary",
        interactive && "transition-shadow hover:shadow-md cursor-pointer",
        className,
      )}
    >
      {hasHeader && (
        <CardHeader>
          {eyebrow && <CardDescription className="uppercase tracking-wider text-xs">{eyebrow}</CardDescription>}
          {title && <CardTitle>{title}</CardTitle>}
        </CardHeader>
      )}
      <CardContent className={cn(!hasHeader && "pt-6")}>{children}</CardContent>
    </ShadCard>
  );
}
