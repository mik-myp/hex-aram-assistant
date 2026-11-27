import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-2xs font-medium whitespace-nowrap shrink-0 transition-colors [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-primary/20 text-[#f0d9a8] border-primary/45',
        secondary: 'bg-secondary text-[#c8c1b2] border-border',
        cyan: 'bg-accent/20 text-[#5cf2e5] border-accent/45',
        emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
        amber: 'bg-amber-500/15 text-amber-200 border-amber-400/40',
        destructive: 'bg-destructive/20 text-rose-300 border-destructive/45',
        outline: 'bg-transparent text-muted-foreground border-white/15'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

export interface BadgeProps
  extends React.ComponentProps<'span'>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps): React.ReactElement {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
