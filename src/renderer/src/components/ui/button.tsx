import * as React from 'react'
import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-xs font-medium transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-3.5',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground font-semibold hover:bg-[#e2c992] shadow-sm',
        cyan:
          'bg-accent/20 text-[#5cf2e5] border border-accent/45 hover:bg-accent/30 font-semibold',
        cyanSolid:
          'bg-accent text-accent-foreground font-bold hover:bg-[#3ce6d8] shadow-sm',
        secondary:
          'bg-secondary text-foreground border border-border hover:bg-[#17243a]',
        outline:
          'bg-transparent text-[#d8e1ee] border border-border hover:bg-secondary hover:text-foreground',
        ghost:
          'text-muted-foreground hover:bg-white/8 hover:text-foreground',
        destructive:
          'bg-destructive/20 text-rose-200 border border-destructive/50 hover:bg-destructive/35'
      },
      size: {
        default: 'h-8.5 px-3 py-1.5',
        sm: 'h-7.5 px-2.5 py-1 text-xs',
        xs: 'h-6.5 px-2 py-0.5 text-2xs rounded',
        lg: 'h-9.5 px-4 text-sm',
        icon: 'size-8',
        'icon-sm': 'size-7'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

export interface ButtonProps
  extends ButtonPrimitive.Props,
    VariantProps<typeof buttonVariants> {}

function Button({
  className,
  variant,
  size,
  ...props
}: ButtonProps): React.ReactElement {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
