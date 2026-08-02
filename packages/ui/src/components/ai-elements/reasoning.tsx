"use client"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@enterprise-agentic-saas/ui/components/collapsible"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { BrainIcon, ChevronDownIcon } from "lucide-react"
import type { ComponentProps } from "react"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { Shimmer } from "./shimmer"

type ReasoningContextValue = {
  duration?: number
  isOpen: boolean
  isStreaming: boolean
  summary?: string
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null)

const useReasoning = () => {
  const value = useContext(ReasoningContext)
  if (!value) throw new Error("Reasoning must contain Reasoning children")
  return value
}

export const Reasoning = ({
  children,
  defaultOpen,
  duration: durationProp,
  isStreaming = false,
  onOpenChange,
  open,
  summary,
  ...props
}: ComponentProps<typeof Collapsible> & {
  duration?: number
  isStreaming?: boolean
  summary?: string
}) => {
  const [localOpen, setLocalOpen] = useState(defaultOpen ?? isStreaming)
  const [duration, setDuration] = useState<number | undefined>(durationProp)
  const startedAt = useRef<number | undefined>(undefined)
  const hasStreamed = useRef(isStreaming)
  const isOpen = open ?? localOpen
  useEffect(() => {
    if (isStreaming) {
      hasStreamed.current = true
      startedAt.current ??= Date.now()
      if (open === undefined) setLocalOpen(true)
      return
    }
    if (startedAt.current !== undefined && durationProp === undefined) {
      setDuration(
        Math.max(1, Math.ceil((Date.now() - startedAt.current) / 1_000))
      )
      startedAt.current = undefined
    }
    if (!hasStreamed.current) return
    const timeout = setTimeout(() => {
      if (open === undefined) setLocalOpen(false)
    }, 300)
    return () => clearTimeout(timeout)
  }, [durationProp, isStreaming, open])
  const handleOpenChange = useCallback(
    (
      next: boolean,
      eventDetails: Parameters<NonNullable<typeof onOpenChange>>[1]
    ) => {
      if (open === undefined) setLocalOpen(next)
      onOpenChange?.(next, eventDetails)
    },
    [onOpenChange, open]
  )
  const value = useMemo(
    () => ({ duration, isOpen, isStreaming, summary }),
    [duration, isOpen, isStreaming, summary]
  )
  return (
    <ReasoningContext.Provider value={value}>
      <Collapsible open={isOpen} onOpenChange={handleOpenChange} {...props}>
        {children}
      </Collapsible>
    </ReasoningContext.Provider>
  )
}

export const ReasoningTrigger = ({
  className,
  ...props
}: ComponentProps<typeof CollapsibleTrigger>) => {
  const { duration, isOpen, isStreaming, summary } = useReasoning()
  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full min-w-0 items-center gap-2 rounded-md py-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none",
        className
      )}
      {...props}
    >
      <BrainIcon className="size-3.5 shrink-0" aria-hidden />
      {isStreaming ? (
        <Shimmer>Reasoning…</Shimmer>
      ) : (
        <span className="min-w-0 truncate">
          Reasoning complete{duration ? ` · ${duration}s` : ""}
          {summary ? ` · ${summary}` : ""}
        </span>
      )}
      <ChevronDownIcon
        className={cn(
          "ml-auto size-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
          isOpen && "rotate-180"
        )}
        aria-hidden
      />
    </CollapsibleTrigger>
  )
}

export const ReasoningContent = ({
  className,
  ...props
}: ComponentProps<typeof CollapsibleContent>) => (
  <CollapsibleContent
    className={cn(
      "mt-2 border-l pl-4 text-sm whitespace-pre-wrap text-muted-foreground motion-reduce:animate-none data-open:animate-in data-open:fade-in data-open:slide-in-from-top-1 data-closed:animate-out data-closed:fade-out data-closed:slide-out-to-top-1",
      className
    )}
    {...props}
  />
)
