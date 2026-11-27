import * as React from 'react'
import { Switch as SwitchPrimitive } from '@base-ui/react/switch'
import { cn } from '@/lib/utils'

function Switch({
  className,
  ...props
}: SwitchPrimitive.Root.Props): React.ReactElement {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border bg-[#0b1322] p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[checked]:bg-accent data-[checked]:border-accent/80 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-3.5 rounded-full bg-[#94a3b8] shadow-sm transition-transform data-[checked]:translate-x-4 data-[checked]:bg-[#06131c]"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
