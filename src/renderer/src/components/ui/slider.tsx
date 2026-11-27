import * as React from 'react'
import { Slider as SliderPrimitive } from '@base-ui/react/slider'
import { cn } from '@/lib/utils'

function Slider<Value extends number | readonly number[] = number>({
  className,
  ...props
}: SliderPrimitive.Root.Props<Value>): React.ReactElement {
  const rawVal = props.value ?? props.defaultValue
  const thumbCount = Array.isArray(rawVal) ? rawVal.length : 1

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        'relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50',
        className
      )}
      {...props}
    >
      <SliderPrimitive.Control className="flex w-full items-center py-2 cursor-pointer">
        <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-[#162338] border border-white/10">
          <SliderPrimitive.Indicator className="h-full bg-accent" />
          {Array.from({ length: thumbCount }).map((_, idx) => (
            <SliderPrimitive.Thumb
              key={idx}
              className="block size-3.5 rounded-full border border-primary bg-[#f0e6d2] shadow-[0_0_8px_rgba(10,200,185,0.45)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          ))}
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
