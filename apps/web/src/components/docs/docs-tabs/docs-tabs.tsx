"use client"

import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react"

type DocsTabsContextValue = {
  id: string
  setValue: (value: string) => void
  value?: string
}

const DocsTabsContext = createContext<DocsTabsContextValue | null>(null)

export const DocsTabs = ({
  children,
  className,
  defaultValue,
}: {
  children: ReactNode
  className?: string
  defaultValue?: string
}) => {
  const [value, setValue] = useState(defaultValue)
  const id = useId().replace(/:/gu, "")
  const contextValue = useMemo(() => ({ id, setValue, value }), [id, value])

  return (
    <DocsTabsContext.Provider value={contextValue}>
      <div className={cn("my-6", className)} data-docs-tabs>
        {children}
      </div>
    </DocsTabsContext.Provider>
  )
}

export const DocsTabsList = ({ children }: { children: ReactNode }) => (
  <div
    className="flex gap-1 overflow-x-auto rounded-t-2xl border border-b-0 bg-muted/50 p-1"
    role="tablist"
  >
    {children}
  </div>
)

export const DocsTabsTrigger = ({
  children,
  value,
}: {
  children: ReactNode
  value: string
}) => {
  const context = useDocsTabsContext()
  const selected = context.value === value
  const handleClick = useCallback(
    () => context.setValue(value),
    [context, value]
  )

  return (
    <button
      aria-controls={`${context.id}-panel-${toId(value)}`}
      aria-selected={selected}
      className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[selected=true]:bg-background data-[selected=true]:text-foreground data-[selected=true]:shadow-xs"
      data-selected={selected}
      id={`${context.id}-tab-${toId(value)}`}
      onClick={handleClick}
      role="tab"
      type="button"
    >
      {children}
    </button>
  )
}

export const DocsTabsContent = ({
  children,
  value,
}: {
  children: ReactNode
  value: string
}) => {
  const context = useDocsTabsContext()
  const selected = context.value === value

  return (
    <div
      aria-labelledby={`${context.id}-tab-${toId(value)}`}
      className="rounded-b-2xl border px-4 py-1"
      data-docs-tab-panel
      hidden={!selected}
      id={`${context.id}-panel-${toId(value)}`}
      role="tabpanel"
      tabIndex={0}
    >
      {children}
    </div>
  )
}

const useDocsTabsContext = (): DocsTabsContextValue => {
  const context = useContext(DocsTabsContext)
  if (!context) throw new Error("DocsTabs components must be inside DocsTabs")
  return context
}

const toId = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
