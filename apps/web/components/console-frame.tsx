import { SidebarInset } from "@enterprise-agentic-saas/ui/components/sidebar"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import type { ReactNode, Ref } from "react"

type ConsoleFrameProps = {
  children: ReactNode
}

type ConsoleFrameContentProps = {
  children: ReactNode
  contentRef?: Ref<HTMLDivElement>
  contentClassName?: string
}

/**
 * The invariant console viewport shared by the ready, loading, and error UI.
 * Route boundaries belong inside the content frame and must not add page
 * padding of their own.
 */
export const ConsoleFrame = ({ children }: ConsoleFrameProps) => (
  <SidebarInset className="h-svh min-w-0 overflow-hidden md:h-[calc(100svh-1rem)]">
    {children}
  </SidebarInset>
)

export const ConsoleFrameHeader = ({ children }: { children: ReactNode }) => (
  <header
    data-slot="console-header"
    className="flex h-14 shrink-0 items-center gap-2 border-b px-4"
  >
    {children}
  </header>
)

export const ConsoleFrameContent = ({
  children,
  contentRef,
  contentClassName,
}: ConsoleFrameContentProps) => (
  <div
    ref={contentRef}
    data-slot="console-scroll-region"
    className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
  >
    <div
      data-slot="console-content"
      className={cn(
        "mx-auto w-full max-w-7xl min-w-0 p-4 sm:p-6 lg:p-8",
        contentClassName
      )}
    >
      {children}
    </div>
  </div>
)
