"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@enterprise-agentic-saas/ui/components/tooltip"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { isToolUIPart } from "ai"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type WheelEvent,
} from "react"

import type { AgentChatMessage } from "../../schema"
import { isNearAgentConversationBottom } from "../agent-conversation-scroll/agent-conversation-scroll"

const turnPreviewTextLimit = 180
const responsePreviewTextLimit = 240

export type AgentConversationTurnPreview = {
  id: string
  prompt: string
  response?: string
  imageCount: number
  contextCount: number
  toolCount: number
}

export type AgentConversationGroup = {
  id: string
  messages: AgentChatMessage[]
  turn?: AgentConversationTurnPreview
}

const normalizePreviewText = (value: string, limit: number) => {
  const normalized = value.replace(/\s+/gu, " ").trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit - 1).trimEnd()}…`
}

const userMessagePreview = (message: AgentChatMessage) => {
  const text = message.parts
    .flatMap((part) => {
      if (part.type === "text") return [part.text]
      if (part.type === "data-context-reference") return [`@${part.data.label}`]
      return []
    })
    .join(" ")
  const imageCount = message.parts.reduce(
    (count, part) =>
      part.type === "data-agent-assets"
        ? count + part.data.assetIds.length
        : count,
    0
  )
  const contextCount = message.parts.filter(
    (part) => part.type === "data-context-reference"
  ).length
  const prompt =
    normalizePreviewText(text, turnPreviewTextLimit) ||
    (imageCount > 0 ? "Image request" : "Agent request")

  return { contextCount, imageCount, prompt }
}

const assistantResponsePreview = (messages: AgentChatMessage[]) => {
  const text = messages
    .filter((message) => message.role === "assistant")
    .flatMap((message) =>
      message.parts.flatMap((part) => (part.type === "text" ? [part.text] : []))
    )
    .join(" ")
  return normalizePreviewText(text, responsePreviewTextLimit) || undefined
}

const toolCountForMessages = (messages: AgentChatMessage[]) =>
  messages.reduce(
    (count, message) =>
      count + message.parts.filter((part) => isToolUIPart(part)).length,
    0
  )

export const buildAgentConversationGroups = (
  messages: AgentChatMessage[]
): AgentConversationGroup[] => {
  const groups: AgentConversationGroup[] = []

  for (const message of messages) {
    if (message.role === "user") {
      const preview = userMessagePreview(message)
      groups.push({
        id: message.id,
        messages: [message],
        turn: {
          id: message.id,
          ...preview,
          toolCount: 0,
        },
      })
      continue
    }

    const current = groups.at(-1)
    if (current?.turn) {
      current.messages.push(message)
      current.turn.response = assistantResponsePreview(current.messages)
      current.turn.toolCount = toolCountForMessages(current.messages)
      continue
    }

    if (current) {
      current.messages.push(message)
    } else {
      groups.push({ id: `leading:${message.id}`, messages: [message] })
    }
  }

  return groups
}

const turnElementsFor = (content: HTMLElement) => [
  ...content.querySelectorAll<HTMLElement>("[data-agent-turn-id]"),
]

const AgentConversationMinimapMarker = ({
  active,
  index,
  turn,
  onJump,
}: {
  active: boolean
  index: number
  turn: AgentConversationTurnPreview
  onJump: (turnId: string) => void
}) => {
  const jump = useCallback(() => onJump(turn.id), [onJump, turn.id])
  const details = [
    turn.imageCount > 0
      ? `${turn.imageCount} image${turn.imageCount === 1 ? "" : "s"}`
      : undefined,
    turn.contextCount > 0
      ? `${turn.contextCount} context item${turn.contextCount === 1 ? "" : "s"}`
      : undefined,
    turn.toolCount > 0
      ? `${turn.toolCount} tool${turn.toolCount === 1 ? "" : "s"}`
      : undefined,
  ].filter((item): item is string => item !== undefined)

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className="group pointer-events-auto grid h-3 w-6 shrink-0 place-items-center outline-none"
        aria-label={`Jump to turn ${index + 1}: ${turn.prompt}`}
        aria-current={active ? "location" : undefined}
        onClick={jump}
      >
        <span
          className={cn(
            "ml-auto h-0.5 w-6 origin-right rounded-full bg-muted-foreground/45 transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
            active
              ? "scale-x-100 bg-foreground"
              : "scale-x-[0.6666667] group-hover:scale-x-100 group-hover:bg-foreground group-focus-visible:scale-x-100 group-focus-visible:bg-foreground"
          )}
          aria-hidden="true"
        />
      </TooltipTrigger>
      <TooltipContent
        role="tooltip"
        side="left"
        sideOffset={8}
        className="w-[min(18rem,calc(100vw-5rem))] max-w-none flex-col items-stretch gap-2 rounded-2xl px-4 py-3"
      >
        <p className="text-[10px] font-medium tracking-wide uppercase opacity-70">
          Turn {index + 1}
        </p>
        <p className="line-clamp-2 text-sm font-medium">{turn.prompt}</p>
        {turn.response ? (
          <p className="line-clamp-3 text-xs opacity-75">{turn.response}</p>
        ) : null}
        {details.length > 0 ? (
          <p className="truncate text-[11px] opacity-70">
            {details.join(" · ")}
          </p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  )
}

const AgentConversationMinimap = ({
  activeTurnId,
  turns,
  onJump,
}: {
  activeTurnId?: string
  turns: AgentConversationTurnPreview[]
  onJump: (turnId: string) => void
}) => (
  <TooltipProvider delay={250}>
    <nav
      data-slot="agent-conversation-minimap"
      className="pointer-events-none absolute top-1/2 right-3 z-10 flex w-6 -translate-y-1/2 flex-col gap-2"
      aria-label="Conversation turns"
    >
      {turns.map((turn, index) => (
        <AgentConversationMinimapMarker
          key={turn.id}
          active={turn.id === activeTurnId}
          index={index}
          turn={turn}
          onJump={onJump}
        />
      ))}
    </nav>
  </TooltipProvider>
)

export const AgentConversationViewport = ({
  children,
  enabled,
  turns,
}: {
  children: ReactNode
  enabled: boolean
  turns: AgentConversationTurnPreview[]
}) => {
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const followingRef = useRef(true)
  const previousScrollTopRef = useRef(0)
  const animationFrameRef = useRef<number | undefined>(undefined)
  const [activeTurnId, setActiveTurnId] = useState<string>()
  const [hasVerticalOverflow, setHasVerticalOverflow] = useState(false)
  const showMinimap = enabled && turns.length >= 2

  const measure = useCallback(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport) return

    const nextHasVerticalOverflow =
      viewport.scrollHeight > viewport.clientHeight
    setHasVerticalOverflow((current) =>
      current === nextHasVerticalOverflow ? current : nextHasVerticalOverflow
    )
    if (!enabled || !content) return

    if (followingRef.current) {
      viewport.scrollTop = Math.max(
        0,
        viewport.scrollHeight - viewport.clientHeight
      )
      previousScrollTopRef.current = viewport.scrollTop
    }

    const turnElements = turnElementsFor(content)
    const activeLine = viewport.scrollTop + viewport.clientHeight / 3
    const activeElement =
      turnElements.findLast((element) => element.offsetTop <= activeLine) ??
      turnElements[0]
    const nextActiveTurnId = activeElement?.dataset.agentTurnId
    setActiveTurnId((current) =>
      current === nextActiveTurnId ? current : nextActiveTurnId
    )
  }, [enabled])

  const scheduleMeasure = useCallback(() => {
    if (animationFrameRef.current !== undefined) return
    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = undefined
      measure()
    })
  }, [measure])

  const handleScroll = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const nextScrollTop = viewport.scrollTop
    if (nextScrollTop < previousScrollTopRef.current) {
      followingRef.current = false
    } else if (
      nextScrollTop > previousScrollTopRef.current &&
      isNearAgentConversationBottom(viewport)
    ) {
      followingRef.current = true
    }
    previousScrollTopRef.current = nextScrollTop
    scheduleMeasure()
  }, [scheduleMeasure])

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY < 0) followingRef.current = false
  }, [])

  const jumpToTurn = useCallback(
    (turnId: string) => {
      const viewport = viewportRef.current
      const content = contentRef.current
      if (!viewport || !content) return
      const target = turnElementsFor(content).find(
        (element) => element.dataset.agentTurnId === turnId
      )
      if (!target) return
      viewport.scrollTop = Math.min(
        Math.max(0, target.offsetTop - 12),
        Math.max(0, viewport.scrollHeight - viewport.clientHeight)
      )
      previousScrollTopRef.current = viewport.scrollTop
      followingRef.current = isNearAgentConversationBottom(viewport)
      scheduleMeasure()
    },
    [scheduleMeasure]
  )

  useEffect(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport) return

    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(viewport)
    if (content) observer.observe(content)
    scheduleMeasure()

    return () => {
      observer.disconnect()
      if (animationFrameRef.current !== undefined) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = undefined
      }
    }
  }, [enabled, scheduleMeasure])

  useEffect(() => {
    if (enabled) scheduleMeasure()
  }, [enabled, scheduleMeasure, turns])

  if (!enabled) {
    return (
      <div
        ref={viewportRef}
        data-testid="agent-conversation-viewport"
        className="min-h-72 flex-1 overflow-y-auto focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
        role={hasVerticalOverflow ? "region" : undefined}
        aria-label={
          hasVerticalOverflow ? "Scrollable Agent conversation" : undefined
        }
        tabIndex={hasVerticalOverflow ? 0 : undefined}
      >
        <div
          ref={contentRef}
          className="space-y-4"
          role="log"
          aria-label="Agent conversation"
          aria-live="polite"
        >
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-72 min-w-0 flex-1">
      <div
        ref={viewportRef}
        data-slot="agent-conversation-viewport"
        data-testid="agent-conversation-viewport"
        className="scrollbar-gutter-stable absolute inset-0 overflow-y-auto focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
        role={hasVerticalOverflow ? "region" : undefined}
        aria-label={
          hasVerticalOverflow ? "Scrollable Agent conversation" : undefined
        }
        tabIndex={hasVerticalOverflow ? 0 : undefined}
        onScroll={handleScroll}
        onWheel={handleWheel}
      >
        <div
          ref={contentRef}
          data-slot="agent-conversation-content"
          className="space-y-4"
          role="log"
          aria-label="Agent conversation"
          aria-live="polite"
        >
          {children}
        </div>
      </div>
      {showMinimap ? (
        <AgentConversationMinimap
          activeTurnId={activeTurnId}
          turns={turns}
          onJump={jumpToTurn}
        />
      ) : null}
    </div>
  )
}
