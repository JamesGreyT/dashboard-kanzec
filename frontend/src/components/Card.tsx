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
        "bg-card rounded-2xl shadow-card border-line",
        accent && "relative before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3px] before:rounded-r-full before:bg-mint",
        interactive && "transition-shadow hover:shadow-cardlg cursor-pointer",
        className,
      )}
    >
      {hasHeader && (
        <CardHeader>
          {eyebrow && (
            <CardDescription className="eyebrow">{eyebrow}</CardDescription>
          )}
          {title && (
            <CardTitle className="font-display text-xl font-semibold tracking-[-0.02em] text-ink">
              {title}
            </CardTitle>
          )}
        </CardHeader>
      )}
      <CardContent className={cn(!hasHeader && "pt-6")}>{children}</CardContent>
    </ShadCard>
  );
}
