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
  <SidebarInset className="min-h-svh min-w-0 md:min-h-[calc(100svh-1rem)] md:self-start md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-0!">
    {children}
  </SidebarInset>
)

export const ConsoleFrameHeader = ({ children }: { children: ReactNode }) => (
  <header
    data-slot="console-header"
    className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur-sm md:top-2 md:rounded-t-2xl md:before:pointer-events-none md:before:absolute md:before:inset-x-0 md:before:-top-2 md:before:h-2 md:before:bg-background/95 md:before:backdrop-blur-sm md:before:content-['']"
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
    data-slot="console-content-region"
    data-scroll-owner="document"
    className="min-h-0 min-w-0 flex-1 overflow-x-hidden"
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
