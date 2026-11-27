import * as React from 'react'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const Select = SelectPrimitive.Root
const SelectGroup = SelectPrimitive.Group
const SelectValue = SelectPrimitive.Value

function SelectTrigger({
  className,
  children,
  ...props
}: SelectPrimitive.Trigger.Props): React.ReactElement {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        'flex h-8 w-full items-center justify-between gap-2 rounded-md border border-input bg-[#131e30] px-2.5 py-1.5 text-xs text-foreground shadow-sm transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer [&_span]:truncate',
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon className="shrink-0 text-muted-foreground">
        <ChevronDown className="size-3.5" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  alignItemWithTrigger = false,
  sideOffset = 6,
  ...props
}: SelectPrimitive.Popup.Props & {
  alignItemWithTrigger?: boolean
  sideOffset?: number
  side?: 'top' | 'bottom' | 'left' | 'right'
}): React.ReactElement {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        alignItemWithTrigger={alignItemWithTrigger}
        sideOffset={sideOffset}
        className="z-50 outline-none"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            'min-w-[var(--anchor-width)] max-h-72 overflow-y-auto rounded-md border border-primary/40 bg-popover p-1 text-popover-foreground shadow-2xl outline-none',
            className
          )}
          {...props}
        >
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props): React.ReactElement {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center justify-between gap-2 rounded py-1.5 pl-2.5 pr-7 text-xs text-[#c8c1b2] outline-none transition-colors data-[highlighted]:bg-[#17263e] data-[highlighted]:text-foreground data-[selected]:text-[#5cf2e5] data-[selected]:font-semibold data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2 flex size-3.5 items-center justify-center text-accent">
        <Check className="size-3.5" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectGroupLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props): React.ReactElement {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn('px-2.5 py-1 text-[11px] font-semibold text-primary', className)}
      {...props}
    />
  )
}

export {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem
}
