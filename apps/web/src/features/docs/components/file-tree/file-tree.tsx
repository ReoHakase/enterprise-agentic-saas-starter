"use client"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@enterprise-agentic-saas/ui/components/collapsible"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import {
  ChevronRightIcon,
  FileCode2Icon,
  FolderIcon,
  FolderOpenIcon,
} from "lucide-react"
import type { ComponentProps, ReactNode } from "react"

export const Files = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    aria-label="File tree"
    className={cn(
      "my-6 overflow-hidden rounded-2xl border bg-muted/20 p-2 font-mono text-sm",
      className
    )}
    data-docs-files
    {...props}
  />
)

export const Folder = ({
  children,
  defaultOpen = false,
  disabled = false,
  icon,
  name,
}: {
  children: ReactNode
  defaultOpen?: boolean
  disabled?: boolean
  icon?: ReactNode
  name: string
}) => (
  <Collapsible
    className="group/docs-folder"
    defaultOpen={defaultOpen}
    disabled={disabled}
  >
    <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
      <ChevronRightIcon
        aria-hidden="true"
        className="size-3.5 shrink-0 transition-transform group-data-open/docs-folder:rotate-90"
      />
      {icon ?? (
        <>
          <FolderIcon
            aria-hidden="true"
            className="size-4 shrink-0 group-data-open/docs-folder:hidden"
          />
          <FolderOpenIcon
            aria-hidden="true"
            className="hidden size-4 shrink-0 group-data-open/docs-folder:block"
          />
        </>
      )}
      <span className="truncate">{name}</span>
    </CollapsibleTrigger>
    <CollapsibleContent className="ml-4 border-l pl-3">
      {children}
    </CollapsibleContent>
  </Collapsible>
)

export const File = ({ icon, name }: { icon?: ReactNode; name: string }) => (
  <div className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-muted-foreground">
    <span className="w-3.5 shrink-0" />
    {icon ?? <FileCode2Icon aria-hidden="true" className="size-4 shrink-0" />}
    <span className="truncate">{name}</span>
  </div>
)
