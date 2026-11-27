import * as React from 'react'
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group'
import { Toggle as TogglePrimitive } from '@base-ui/react/toggle'
import { cn } from '@/lib/utils'

function ToggleGroup({
  className,
  ...props
}: ToggleGroupPrimitive.Props): React.ReactElement {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      className={cn(
        'inline-flex items-center gap-1 rounded-md bg-[#0b1220] border border-border p-0.5',
        className
      )}
      {...props}
    />
  )
}

function ToggleGroupItem({
  className,
  ...props
}: TogglePrimitive.Props): React.ReactElement {
  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      className={cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none data-[pressed]:bg-primary data-[pressed]:text-primary-foreground data-[pressed]:font-semibold cursor-pointer disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*="size-"])]:size-3.5',
        className
      )}
      {...props}
    />
  )
}

export { ToggleGroup, ToggleGroupItem }
