"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@enterprise-agentic-saas/ui/components/sheet"
import { useIsMobile } from "@enterprise-agentic-saas/ui/hooks/use-mobile"
import { useHotkey } from "@tanstack/react-hotkeys"
import { useAtom } from "jotai"
import { BotIcon, GripVerticalIcon, XIcon } from "lucide-react"
import { usePathname } from "next/navigation"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react"

import { isAgentHotkeyAllowed } from "../../hotkey-scope"
import {
  AGENT_PANE_MAX_WIDTH,
  AGENT_PANE_MIN_WIDTH,
  AGENT_PANE_WIDTH_STORAGE_KEY,
  agentPaneWidthAtom,
  agentShellOpenAtom,
  clampAgentPaneWidth,
} from "../../shell-state"
import { AgentDashboard } from "../agent-dashboard/agent-dashboard"

type AgentShellOrganization = {
  id: string
  slug: string
  name: string
}

type AgentShellProps = {
  userId: string
  organization?: AgentShellOrganization
  contextMismatch: boolean
}

type ResizeState = {
  pointerId: number
  startX: number
  startWidth: number
}

const agentPaneId = "persistent-agent-shell"

const persistPaneWidth = (width: number) => {
  try {
    window.localStorage.setItem(
      AGENT_PANE_WIDTH_STORAGE_KEY,
      clampAgentPaneWidth(width).toString()
    )
  } catch {
    // Width persistence is a non-critical preference.
  }
}

export const AgentShellTrigger = ({ disabled }: { disabled?: boolean }) => {
  const [open, setOpen] = useAtom(agentShellOpenAtom)
  const toggle = useCallback(() => setOpen((current) => !current), [setOpen])
  useHotkey(
    "Mod+K",
    (event) => {
      if (!isAgentHotkeyAllowed(event)) return
      toggle()
    },
    {
      enabled: !disabled,
      conflictBehavior: "allow",
      meta: { name: "Toggle Agent pane", description: "Open or close Agent" },
    }
  )

  return (
    <Button
      type="button"
      variant={open ? "secondary" : "ghost"}
      size="sm"
      disabled={disabled}
      aria-controls={agentPaneId}
      aria-expanded={open}
      aria-label={open ? "Close Agent" : "Open Agent"}
      onClick={toggle}
    >
      <BotIcon aria-hidden="true" />
      <span className="hidden lg:inline">Agent</span>
    </Button>
  )
}

export const AgentShell = ({
  userId,
  organization,
  contextMismatch,
}: AgentShellProps) => {
  const pathname = usePathname()
  const isMobile = useIsMobile()
  const [open, setOpen] = useAtom(agentShellOpenAtom)
  const [paneWidth, setPaneWidth] = useAtom(agentPaneWidthAtom)
  const paneWidthRef = useRef(paneWidth)
  const resizeRef = useRef<ResizeState | undefined>(undefined)
  const scopeKey = `${userId}:${organization?.id ?? ""}`
  const previousScopeRef = useRef(scopeKey)
  const dedicatedAgentPath = organization
    ? `/organization/${organization.slug}/agent`
    : undefined

  useEffect(() => {
    if (previousScopeRef.current === scopeKey) return
    previousScopeRef.current = scopeKey
    setOpen(false)
  }, [scopeKey, setOpen])

  useEffect(() => {
    if (dedicatedAgentPath && pathname === dedicatedAgentPath) setOpen(true)
  }, [dedicatedAgentPath, pathname, setOpen])

  useEffect(() => {
    if (organization) return
    setOpen(false)
  }, [organization, setOpen])

  useEffect(() => {
    try {
      const storedWidth = Number(
        window.localStorage.getItem(AGENT_PANE_WIDTH_STORAGE_KEY)
      )
      if (!Number.isFinite(storedWidth) || storedWidth <= 0) return
      const nextWidth = clampAgentPaneWidth(storedWidth)
      paneWidthRef.current = nextWidth
      setPaneWidth(nextWidth)
    } catch {
      // Keep the deterministic default when storage is unavailable.
    }
  }, [setPaneWidth])

  const updatePaneWidth = useCallback(
    (width: number) => {
      const nextWidth = clampAgentPaneWidth(width)
      paneWidthRef.current = nextWidth
      setPaneWidth(nextWidth)
    },
    [setPaneWidth]
  )
  const startResize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: paneWidthRef.current,
    }
  }, [])
  const resize = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const current = resizeRef.current
      if (!current || current.pointerId !== event.pointerId) return
      updatePaneWidth(current.startWidth + current.startX - event.clientX)
    },
    [updatePaneWidth]
  )
  const finishResize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const current = resizeRef.current
    if (!current || current.pointerId !== event.pointerId) return
    resizeRef.current = undefined
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    persistPaneWidth(paneWidthRef.current)
  }, [])
  const resizeWithKeyboard = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      let nextWidth: number | undefined
      if (event.key === "ArrowLeft") nextWidth = paneWidthRef.current + 20
      if (event.key === "ArrowRight") nextWidth = paneWidthRef.current - 20
      if (event.key === "Home") nextWidth = AGENT_PANE_MIN_WIDTH
      if (event.key === "End") nextWidth = AGENT_PANE_MAX_WIDTH
      if (nextWidth === undefined) return
      event.preventDefault()
      updatePaneWidth(nextWidth)
      persistPaneWidth(nextWidth)
    },
    [updatePaneWidth]
  )
  const close = useCallback(() => setOpen(false), [setOpen])
  const handleSheetOpenChange = useCallback(
    (nextOpen: boolean) => setOpen(nextOpen),
    [setOpen]
  )
  const paneStyle = useMemo<CSSProperties>(
    () => ({ width: paneWidth }),
    [paneWidth]
  )

  if (!organization || !open) return null

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleSheetOpenChange}>
        <SheetContent
          id={agentPaneId}
          side="right"
          showCloseButton={false}
          className="inset-0 size-full max-w-none rounded-none border-0 p-0 duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] data-[side=right]:inset-0 data-[side=right]:size-full data-[side=right]:max-w-none data-[side=right]:sm:max-w-none"
        >
          <SheetHeader className="flex-row items-center gap-3 border-b p-4 text-left">
            <div className="min-w-0 flex-1">
              <SheetTitle>Agent</SheetTitle>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Close Agent"
              onClick={close}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </SheetHeader>
          <AgentShellBody
            organization={organization}
            contextMismatch={contextMismatch}
          />
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <aside
      id={agentPaneId}
      data-slot="agent-shell"
      className="sticky top-2 my-2 mr-2 hidden h-[calc(100svh-1rem)] min-w-0 shrink-0 flex-col self-start overflow-hidden rounded-2xl border bg-background shadow-sm md:flex"
      style={paneStyle}
      aria-label="Agent"
    >
      <div
        role="separator"
        tabIndex={0}
        className="group absolute inset-y-0 left-0 z-20 flex w-4 cursor-col-resize touch-none items-center justify-center outline-none after:absolute after:inset-y-0 after:left-0 after:w-px after:bg-border hover:after:bg-primary focus-visible:after:w-0.5 focus-visible:after:bg-ring"
        aria-label="Resize Agent pane"
        aria-controls={agentPaneId}
        aria-orientation="vertical"
        aria-valuemin={AGENT_PANE_MIN_WIDTH}
        aria-valuemax={AGENT_PANE_MAX_WIDTH}
        aria-valuenow={paneWidth}
        onPointerDown={startResize}
        onPointerMove={resize}
        onPointerUp={finishResize}
        onPointerCancel={finishResize}
        onKeyDown={resizeWithKeyboard}
      >
        <GripVerticalIcon
          className="relative z-10 size-3 rounded bg-background text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden="true"
        />
      </div>
      <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <BotIcon className="size-4" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium">Agent</h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close Agent"
          onClick={close}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      <AgentShellBody
        organization={organization}
        contextMismatch={contextMismatch}
      />
    </aside>
  )
}

const AgentShellBody = ({
  organization,
  contextMismatch,
}: {
  organization: AgentShellOrganization
  contextMismatch: boolean
}) => (
  <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
    {contextMismatch ? (
      <p
        role="status"
        className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200"
      >
        This route belongs to another organization. Activate it before using the
        Agent or client tools.
      </p>
    ) : null}
    <AgentDashboard
      organizationId={organization.id}
      organizationSlug={organization.slug}
      presentation="shell"
      disabled={contextMismatch}
    />
  </div>
)
