"use client"

import {
  Tabs as UiTabs,
  TabsContent as UiTabsContent,
  TabsIndicator as UiTabsIndicator,
  TabsList as UiTabsList,
  TabsTrigger as UiTabsTrigger,
} from "@enterprise-agentic-saas/ui/components/tabs"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import type { ComponentProps } from "react"

export const Tabs = ({
  className,
  ...props
}: ComponentProps<typeof UiTabs>) => (
  <UiTabs className={cn("my-6 min-w-0", className)} data-docs-tabs {...props} />
)

export const TabsList = ({
  className,
  children,
  ...props
}: ComponentProps<typeof UiTabsList>) => (
  <UiTabsList
    activateOnFocus
    className={cn(
      "gap-1 overflow-x-auto rounded-t-2xl border border-b-0 bg-muted/50 p-1",
      className
    )}
    {...props}
  >
    {children}
    <UiTabsIndicator className="bottom-1 h-0.5 rounded-full bg-primary transition-[translate,width] duration-200" />
  </UiTabsList>
)

export const TabsTrigger = ({
  className,
  ...props
}: ComponentProps<typeof UiTabsTrigger>) => (
  <UiTabsTrigger
    className={cn(
      "flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-active:bg-background data-active:text-foreground data-active:shadow-xs",
      className
    )}
    {...props}
  />
)

export const TabsContent = ({
  className,
  ...props
}: ComponentProps<typeof UiTabsContent>) => (
  <UiTabsContent
    className={cn(
      "rounded-b-2xl border px-4 py-1 focus-visible:ring-2 focus-visible:ring-ring [&_[data-docs-code-block]]:my-3",
      className
    )}
    data-docs-tab-panel
    {...props}
  />
)
