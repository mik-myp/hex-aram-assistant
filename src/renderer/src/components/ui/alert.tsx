import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const alertVariants = cva(
  'relative w-full rounded-lg border p-3 text-xs flex items-start gap-2.5 [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
  {
    variants: {
      variant: {
        default: 'bg-[#0e1728] border-border text-[#c8c1b2]',
        cyan: 'bg-accent/10 border-accent/40 text-[#ccfbf1]',
        warning: 'bg-amber-500/12 border-amber-400/50 text-amber-100',
        destructive: 'bg-destructive/15 border-destructive/50 text-rose-100'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>): React.ReactElement {
  return (
    <div
      role="alert"
      data-slot="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div
      data-slot="alert-title"
      className={cn('font-semibold text-foreground leading-snug', className)}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div
      data-slot="alert-description"
      className={cn('text-muted-foreground mt-0.5 leading-relaxed', className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
