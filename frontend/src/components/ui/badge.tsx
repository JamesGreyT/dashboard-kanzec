import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border-transparent px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        sage: "bg-accent text-accent-foreground",
        terra: "bg-[hsl(24,50%,90%)] text-[hsl(21,50%,40%)]",
        warning: "bg-[hsl(45,80%,90%)] text-[hsl(35,60%,30%)]",
        destructive: "bg-destructive text-destructive-foreground",
        outline: "border border-border text-foreground bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
