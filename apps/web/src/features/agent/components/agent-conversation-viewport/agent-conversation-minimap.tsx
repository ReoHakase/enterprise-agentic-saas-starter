"use client"

import { useConversation } from "@enterprise-agentic-saas/ui/components/ai-elements/conversation"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@enterprise-agentic-saas/ui/components/tooltip"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { useCallback, useEffect, useState } from "react"

import type { AgentConversationTurnPreview } from "./agent-conversation-viewport"

const turnElementsFor = (viewport: HTMLElement) => [
  ...viewport.querySelectorAll<HTMLElement>("[data-agent-turn-id]"),
]

const Marker = ({
  active,
  index,
  onJump,
  turn,
}: {
  active: boolean
  index: number
  onJump: (turnId: string) => void
  turn: AgentConversationTurnPreview
}) => {
  const jumpToTurn = useCallback(() => onJump(turn.id), [onJump, turn.id])
  const details = [
    turn.imageCount > 0 ? `${turn.imageCount} images` : undefined,
    turn.contextCount > 0 ? `${turn.contextCount} context` : undefined,
    turn.toolCount > 0 ? `${turn.toolCount} tools` : undefined,
  ].filter((value): value is string => Boolean(value))
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className="group pointer-events-auto grid h-3 w-6 shrink-0 place-items-center outline-none"
        aria-label={`Jump to turn ${index + 1}: ${turn.prompt}`}
        aria-current={active ? "location" : undefined}
        onClick={jumpToTurn}
      >
        <span
          className={cn(
            "ml-auto h-0.5 w-6 origin-right rounded-full bg-muted-foreground/45 transition-transform duration-150 motion-reduce:transition-none",
            active
              ? "scale-x-100 bg-foreground"
              : "scale-x-2/3 group-hover:scale-x-100 group-hover:bg-foreground group-focus-visible:scale-x-100 group-focus-visible:bg-foreground"
          )}
          aria-hidden
        />
      </TooltipTrigger>
      <TooltipContent
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

export const AgentConversationMinimap = ({
  turns,
}: {
  turns: AgentConversationTurnPreview[]
}) => {
  const { scrollRef, stopScroll } = useConversation()
  const [activeTurnId, setActiveTurnId] = useState(turns.at(-1)?.id)
  const measure = useCallback(() => {
    const viewport = scrollRef.current
    if (!viewport) return
    const activeLine =
      viewport.getBoundingClientRect().top + viewport.clientHeight / 3
    const elements = turnElementsFor(viewport)
    const active =
      elements.findLast(
        (element) => element.getBoundingClientRect().top <= activeLine
      ) ?? elements[0]
    setActiveTurnId(active?.dataset.agentTurnId)
  }, [scrollRef])
  useEffect(() => {
    const viewport = scrollRef.current
    if (!viewport) return
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    viewport.addEventListener("scroll", measure, { passive: true })
    measure()
    return () => {
      observer.disconnect()
      viewport.removeEventListener("scroll", measure)
    }
  }, [measure, scrollRef, turns])
  const jump = useCallback(
    (turnId: string) => {
      const viewport = scrollRef.current
      const target = viewport
        ? turnElementsFor(viewport).find(
            (element) => element.dataset.agentTurnId === turnId
          )
        : undefined
      if (!viewport || !target) return
      stopScroll()
      const top =
        target.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top +
        viewport.scrollTop -
        12
      viewport.scrollTo({ behavior: "auto", top: Math.max(0, top) })
      setActiveTurnId(turnId)
    },
    [scrollRef, stopScroll]
  )
  return (
    <TooltipProvider delay={250}>
      <nav
        data-slot="agent-conversation-minimap"
        className="pointer-events-none absolute top-1/2 right-3 z-10 flex w-6 -translate-y-1/2 flex-col gap-2"
        aria-label="Conversation turns"
      >
        {turns.map((turn, index) => (
          <Marker
            key={turn.id}
            active={turn.id === activeTurnId}
            index={index}
            onJump={jump}
            turn={turn}
          />
        ))}
      </nav>
    </TooltipProvider>
  )
}
