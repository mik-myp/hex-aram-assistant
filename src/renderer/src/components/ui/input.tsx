import * as React from 'react'
import { Input as InputPrimitive } from '@base-ui/react/input'
import { cn } from '@/lib/utils'

function Input({
  className,
  type = 'text',
  ...props
}: InputPrimitive.Props): React.ReactElement {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-8.5 w-full rounded-md bg-[#131e30] border border-input px-2.5 py-1 text-xs text-foreground placeholder:text-[#8ea0b8] transition-colors focus-visible:outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 select-text',
        className
      )}
      {...props}
    />
  )
}

export { Input }
