"use client"

import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"

type TableProps = ComponentProps<"table"> & {
  containerClassName?: string
  scrollLabel?: string
}

function Table({
  className,
  containerClassName,
  scrollLabel,
  ...props
}: TableProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false)
  const updateOverflowState = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    setHasHorizontalOverflow(container.scrollWidth > container.clientWidth)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    updateOverflowState()
    const observer = new ResizeObserver(updateOverflowState)
    observer.observe(container)
    const table = container.querySelector("table")
    if (table) observer.observe(table)

    return () => observer.disconnect()
  }, [updateOverflowState])

  const accessibleScrollLabel = scrollLabel ?? props["aria-label"]

  return (
    <div
      ref={containerRef}
      data-slot="table-container"
      data-horizontal-overflow={hasHorizontalOverflow ? "true" : undefined}
      role={hasHorizontalOverflow ? "region" : undefined}
      aria-label={
        hasHorizontalOverflow
          ? (accessibleScrollLabel ?? "Scrollable data table")
          : undefined
      }
      tabIndex={hasHorizontalOverflow ? 0 : undefined}
      className={cn(
        "relative w-full max-w-full min-w-0 overflow-x-auto overscroll-x-contain focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
        containerClassName
      )}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-12 px-3 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-3 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({ className, ...props }: ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
