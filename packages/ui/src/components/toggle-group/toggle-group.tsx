"use client"

import { Toggle } from "@base-ui/react/toggle"
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

type ToggleGroupStyle = {
  size: "default" | "sm"
  variant: "default" | "outline"
}

const ToggleGroupStyleContext = createContext<ToggleGroupStyle>({
  size: "default",
  variant: "outline",
})

function ToggleGroup({
  className,
  value,
  defaultValue,
  onValueChange,
  required = false,
  size = "default",
  variant = "outline",
  children,
  ...props
}: Omit<
  ToggleGroupPrimitive.Props<string>,
  "defaultValue" | "multiple" | "onValueChange" | "value"
> & {
  type: "single"
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  required?: boolean
  size?: ToggleGroupStyle["size"]
  variant?: ToggleGroupStyle["variant"]
  children: ReactNode
}) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? "")
  const handleValueChange = useCallback(
    (next: string[]) => {
      const selected = next[0] ?? ""
      if (required && !selected) return
      if (value === undefined) setUncontrolledValue(selected)
      onValueChange?.(selected)
    },
    [onValueChange, required, value]
  )
  const selectedValue = value === undefined ? uncontrolledValue : value
  const controlledValue = useMemo(
    () => (selectedValue ? [selectedValue] : []),
    [selectedValue]
  )
  const style = useMemo(() => ({ size, variant }), [size, variant])
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      className={cn(
        "inline-flex w-fit items-center rounded-4xl",
        variant === "outline" && "border border-border",
        className
      )}
      value={controlledValue}
      onValueChange={handleValueChange}
      {...props}
    >
      <ToggleGroupStyleContext.Provider value={style}>
        {children}
      </ToggleGroupStyleContext.Provider>
    </ToggleGroupPrimitive>
  )
}

function ToggleGroupItem({ className, ...props }: Toggle.Props<string>) {
  const { size, variant } = useContext(ToggleGroupStyleContext)
  return (
    <Toggle
      data-slot="toggle-group-item"
      className={cn(
        "inline-flex items-center justify-center text-sm font-medium transition-colors outline-none first:rounded-l-4xl last:rounded-r-4xl focus-visible:relative focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 data-pressed:bg-primary data-pressed:text-primary-foreground",
        variant === "outline" &&
          "not-first:border-l hover:bg-muted data-pressed:hover:bg-primary",
        size === "sm" ? "h-8 px-3" : "h-9 px-4",
        className
      )}
      {...props}
    />
  )
}

export { ToggleGroup, ToggleGroupItem }
