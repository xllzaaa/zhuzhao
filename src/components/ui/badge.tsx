import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Premium Badge：胶囊式，与 MetricPill 风格协调
const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-pill transition-colors duration-180 ease-apple-out focus:outline-none focus:ring-2 focus:ring-ring/60 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary/15 text-primary hover:bg-primary/20",
        secondary:
          "border-transparent bg-secondary/80 text-secondary-foreground hover:bg-secondary",
        destructive:
          "border-transparent bg-destructive/15 text-destructive hover:bg-destructive/20",
        outline: "border-border/60 text-foreground hover:bg-accent/40",
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
