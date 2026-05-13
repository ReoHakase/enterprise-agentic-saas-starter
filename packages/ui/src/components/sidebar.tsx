"use client"

/* oxlint-disable eslint(func-style) */

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
import { Separator } from "@enterprise-agentic-saas/ui/components/separator"
import { Skeleton } from "@enterprise-agentic-saas/ui/components/skeleton"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { PanelLeftIcon } from "lucide-react"
import * as React from "react"

type SidebarContextProps = {
  open: boolean
  openMobile: boolean
  setOpen: (open: boolean) => void
  setOpenMobile: (open: boolean) => void
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }
  return context
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [_open, _setOpen] = React.useState(defaultOpen)
  const [openMobile, setOpenMobile] = React.useState(false)
  const open = openProp ?? _open
  const setOpen = React.useCallback(
    (value: boolean) => {
      onOpenChange?.(value)
      if (openProp === undefined) {
        _setOpen(value)
      }
    },
    [onOpenChange, openProp]
  )
  const toggleSidebar = React.useCallback(() => {
    if (globalThis.matchMedia("(max-width: 767px)").matches) {
      setOpenMobile((value) => !value)
      return
    }

    setOpen(!open)
  }, [open, setOpen])
  const contextValue = React.useMemo(
    () => ({ open, openMobile, setOpen, setOpenMobile, toggleSidebar }),
    [open, openMobile, setOpen, toggleSidebar]
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        data-state={open ? "expanded" : "collapsed"}
        className={cn("flex min-h-svh w-full bg-background", className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

function Sidebar({
  className,
  children,
  ...props
}: React.ComponentProps<"aside">) {
  const { open, openMobile, setOpenMobile } = useSidebar()
  const closeMobileSidebar = React.useCallback(() => {
    setOpenMobile(false)
  }, [setOpenMobile])

  return (
    <>
      {openMobile ? (
        <button
          aria-label="Close sidebar"
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          type="button"
          onClick={closeMobileSidebar}
        />
      ) : null}
      <aside
        data-slot="sidebar"
        data-state={open ? "expanded" : "collapsed"}
        data-mobile-state={openMobile ? "open" : "closed"}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-svh w-72 shrink-0 -translate-x-full flex-col border-r bg-sidebar text-sidebar-foreground transition-transform duration-200 ease-out md:sticky md:top-0 md:z-auto md:w-64 md:translate-x-0",
          openMobile && "translate-x-0",
          !open && "md:w-16",
          className
        )}
        {...props}
      >
        {children}
      </aside>
    </>
  )
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        "flex min-h-svh min-w-0 flex-1 flex-col bg-background",
        className
      )}
      {...props}
    />
  )
}

function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()
  const handleClick: React.ComponentProps<typeof Button>["onClick"] =
    React.useCallback(
      (
        event: Parameters<
          NonNullable<React.ComponentProps<typeof Button>["onClick"]>
        >[0]
      ) => {
        onClick?.(event)
        toggleSidebar()
      },
      [onClick, toggleSidebar]
    )

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      className={cn(className)}
      onClick={handleClick}
      {...props}
    >
      <PanelLeftIcon />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn("flex flex-col gap-4 p-4", className)}
      {...props}
    />
  )
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-2 py-3",
        className
      )}
      {...props}
    />
  )
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      className={cn("flex min-w-0 flex-col gap-2 p-0", className)}
      {...props}
    />
  )
}

function SidebarGroupLabel({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-label"
      className={cn(
        "px-3 py-2 text-xs font-medium text-sidebar-foreground/70",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-content"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    />
  )
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      className={cn("flex min-w-0 flex-col gap-1", className)}
      {...props}
    />
  )
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      className={cn("min-w-0", className)}
      {...props}
    />
  )
}

function SidebarMenuButton({
  className,
  isActive,
  ...props
}: React.ComponentProps<"button"> & { isActive?: boolean }) {
  return (
    <button
      data-slot="sidebar-menu-button"
      data-active={isActive}
      className={cn(
        "flex h-9 w-full min-w-0 items-center gap-2 rounded-2xl px-3 text-left text-sm transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&>span:last-child]:truncate",
        className
      )}
      {...props}
    />
  )
}

function SidebarInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="sidebar-input"
      className={cn("h-8 bg-input/50 shadow-none", className)}
      {...props}
    />
  )
}

function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      className={cn(
        "mx-2 bg-sidebar-border data-horizontal:w-[calc(100%-1rem)]",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuSkeleton({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-menu-skeleton"
      className={cn("flex h-8 items-center gap-2 rounded-2xl px-2", className)}
      {...props}
    >
      <Skeleton className="size-4 rounded-2xl" />
      <Skeleton className="h-4 flex-1" />
    </div>
  )
}

function SidebarRail(props: React.ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar()
  return (
    <button
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      className="hidden"
      {...props}
    />
  )
}

const SidebarGroupAction = SidebarMenuButton
const SidebarMenuAction = SidebarMenuButton
const SidebarMenuBadge = (props: React.ComponentProps<"div">) => (
  <div {...props} />
)
const SidebarMenuSub = SidebarMenu
const SidebarMenuSubItem = SidebarMenuItem
const SidebarMenuSubButton = SidebarMenuButton

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
}
