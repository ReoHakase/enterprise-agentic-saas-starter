import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AgentChatMessage } from "../schema"
import { isNearAgentConversationBottom } from "./agent-conversation-scroll"
import {
  AgentConversationViewport,
  buildAgentConversationGroups,
  type AgentConversationTurnPreview,
} from "./agent-conversation-viewport"

const turns: AgentConversationTurnPreview[] = [
  {
    id: "turn-1",
    prompt: "First request",
    response: "First response",
    imageCount: 0,
    contextCount: 0,
    toolCount: 0,
  },
  {
    id: "turn-2",
    prompt: "Second request",
    response: "Second response",
    imageCount: 1,
    contextCount: 1,
    toolCount: 1,
  },
]

const previewMessages: AgentChatMessage[] = [
  {
    id: "turn-1",
    role: "user",
    parts: [
      { type: "text", text: "  Review\nthis Issue  " },
      {
        type: "data-context-reference",
        data: { kind: "issue", id: "issue-1", label: "Issue #1" },
      },
      {
        type: "data-agent-assets",
        data: { assetIds: ["asset-1", "asset-2"] },
      },
    ],
  },
  {
    id: "answer-1",
    role: "assistant",
    parts: [
      { type: "text", text: "I reviewed the Issue and prepared a fix." },
      {
        type: "dynamic-tool",
        toolName: "get_issue",
        toolCallId: "tool-1",
        state: "output-available",
        input: { number: 1 },
        output: { number: 1 },
      },
    ],
  },
  {
    id: "turn-2",
    role: "user",
    parts: [
      {
        type: "data-agent-assets",
        data: { assetIds: ["asset-3"] },
      },
    ],
  },
]

type MutableViewportMetrics = {
  clientHeight: number
  scrollHeight: number
  scrollTop: number
}

let resizeObservers: ResizeObserverStub[] = []
let animationFrames = new Map<number, FrameRequestCallback>()
let nextAnimationFrameId = 1

class ResizeObserverStub implements ResizeObserver {
  readonly callback: ResizeObserverCallback
  readonly disconnect = vi.fn<ResizeObserver["disconnect"]>()
  readonly observe = vi.fn<ResizeObserver["observe"]>()
  readonly unobserve = vi.fn<ResizeObserver["unobserve"]>()

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    resizeObservers.push(this)
  }

  trigger() {
    this.callback([], this)
  }
}

const flushAnimationFrames = () => {
  const frames = [...animationFrames.entries()]
  animationFrames.clear()
  for (const [, callback] of frames) callback(performance.now())
}

const triggerResizeObservers = () => {
  for (const observer of resizeObservers) observer.trigger()
}

const installViewportMetrics = (
  viewport: HTMLElement,
  metrics: MutableViewportMetrics
) => {
  Object.defineProperties(viewport, {
    clientHeight: {
      configurable: true,
      get: () => metrics.clientHeight,
    },
    scrollHeight: {
      configurable: true,
      get: () => metrics.scrollHeight,
    },
    scrollTop: {
      configurable: true,
      get: () => metrics.scrollTop,
      set: (value: number) => {
        metrics.scrollTop = value
      },
    },
  })
}

const setTurnOffset = (element: Element, offsetTop: number) => {
  Object.defineProperty(element, "offsetTop", {
    configurable: true,
    value: offsetTop,
  })
}

beforeEach(() => {
  resizeObservers = []
  animationFrames = new Map()
  nextAnimationFrameId = 1
  vi.stubGlobal("ResizeObserver", ResizeObserverStub)
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      const id = nextAnimationFrameId
      nextAnimationFrameId += 1
      animationFrames.set(id, callback)
      return id
    })
  )
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => {
      animationFrames.delete(id)
    })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("AgentConversationViewport", () => {
  it("groups user-led turns and derives bounded local previews", () => {
    const groups = buildAgentConversationGroups(previewMessages)

    expect(groups).toHaveLength(2)
    expect(groups[0]?.messages).toHaveLength(2)
    expect(groups[0]?.turn).toEqual({
      id: "turn-1",
      prompt: "Review this Issue @Issue #1",
      response: "I reviewed the Issue and prepared a fix.",
      imageCount: 2,
      contextCount: 1,
      toolCount: 1,
    })
    expect(groups[1]?.turn).toMatchObject({
      id: "turn-2",
      prompt: "Image request",
      imageCount: 1,
    })
  })

  it("uses the inclusive 96px bottom boundary", () => {
    expect(
      isNearAgentConversationBottom({
        clientHeight: 300,
        scrollHeight: 1000,
        scrollTop: 1000 - 300 - 96,
      })
    ).toBe(true)
    expect(
      isNearAgentConversationBottom({
        clientHeight: 300,
        scrollHeight: 1000,
        scrollTop: 1000 - 300 - 96 - 1,
      })
    ).toBe(false)
  })

  it("follows content and viewport growth only while the reader stays near the bottom", () => {
    const { unmount } = render(
      <AgentConversationViewport enabled turns={turns}>
        <div data-agent-turn-id="turn-1" data-testid="turn-1">
          First turn
        </div>
        <div data-agent-turn-id="turn-2" data-testid="turn-2">
          Second turn
        </div>
      </AgentConversationViewport>
    )
    const viewport = screen.getByTestId("agent-conversation-viewport")
    const firstTurn = screen.getByTestId("turn-1")
    const secondTurn = screen.getByTestId("turn-2")
    const metrics: MutableViewportMetrics = {
      clientHeight: 300,
      scrollHeight: 1000,
      scrollTop: 0,
    }
    installViewportMetrics(viewport, metrics)
    setTurnOffset(firstTurn, 0)
    setTurnOffset(secondTurn, 600)

    act(flushAnimationFrames)
    expect(viewport).toHaveAttribute("role", "region")
    expect(viewport).toHaveAccessibleName("Scrollable Agent conversation")
    expect(viewport).toHaveAttribute("tabindex", "0")
    expect(metrics.scrollTop).toBe(700)

    metrics.scrollTop = 680
    fireEvent.scroll(viewport)
    fireEvent.scroll(viewport)
    act(flushAnimationFrames)
    expect(metrics.scrollTop).toBe(680)

    metrics.scrollHeight = 1100
    act(() => {
      triggerResizeObservers()
      flushAnimationFrames()
    })
    expect(metrics.scrollTop).toBe(680)

    metrics.scrollTop = 1100 - 300 - 95
    fireEvent.scroll(viewport)
    act(flushAnimationFrames)
    expect(metrics.scrollTop).toBe(800)

    metrics.clientHeight = 250
    act(() => {
      triggerResizeObservers()
      flushAnimationFrames()
    })
    expect(metrics.scrollTop).toBe(850)

    fireEvent.wheel(viewport, { deltaY: -10 })
    metrics.scrollHeight = 1200
    act(() => {
      triggerResizeObservers()
      flushAnimationFrames()
    })
    expect(metrics.scrollTop).toBe(850)

    metrics.scrollTop = 500
    fireEvent.scroll(viewport)
    act(flushAnimationFrames)
    metrics.scrollHeight = 1300
    act(() => {
      triggerResizeObservers()
      flushAnimationFrames()
    })
    expect(metrics.scrollTop).toBe(500)

    metrics.scrollTop = 1300 - 250 - 95
    fireEvent.scroll(viewport)
    act(flushAnimationFrames)
    metrics.scrollHeight = 1400
    act(() => {
      triggerResizeObservers()
      flushAnimationFrames()
    })
    expect(metrics.scrollTop).toBe(1150)

    const observers = [...resizeObservers]
    act(triggerResizeObservers)
    const pendingFrameId = [...animationFrames.keys()][0]
    expect(pendingFrameId).toBeDefined()
    unmount()
    for (const observer of observers) {
      expect(observer.disconnect).toHaveBeenCalledOnce()
    }
    expect(cancelAnimationFrame).toHaveBeenCalledWith(pendingFrameId)
  })

  it("exposes a right-side turn navigator with click and keyboard jumps", async () => {
    const user = userEvent.setup()
    render(
      <AgentConversationViewport enabled turns={turns}>
        <div data-agent-turn-id="turn-1" data-testid="turn-1">
          First turn
        </div>
        <div data-agent-turn-id="turn-2" data-testid="turn-2">
          Second turn
        </div>
      </AgentConversationViewport>
    )
    const viewport = screen.getByTestId("agent-conversation-viewport")
    const firstTurn = screen.getByTestId("turn-1")
    const secondTurn = screen.getByTestId("turn-2")
    const metrics: MutableViewportMetrics = {
      clientHeight: 300,
      scrollHeight: 900,
      scrollTop: 0,
    }
    installViewportMetrics(viewport, metrics)
    setTurnOffset(firstTurn, 0)
    setTurnOffset(secondTurn, 500)
    act(flushAnimationFrames)

    const first = screen.getByRole("button", {
      name: "Jump to turn 1: First request",
    })
    const second = screen.getByRole("button", {
      name: "Jump to turn 2: Second request",
    })
    expect(second).toHaveAttribute("aria-current", "location")

    await user.click(first)
    act(flushAnimationFrames)
    expect(metrics.scrollTop).toBe(0)
    expect(first).toHaveAttribute("aria-current", "location")

    second.focus()
    await user.keyboard("{Enter}")
    act(flushAnimationFrames)
    expect(metrics.scrollTop).toBe(488)
    expect(second).toHaveAttribute("aria-current", "location")
  })

  it("keeps the dedicated page presentation free of pane minimap behavior", () => {
    render(
      <AgentConversationViewport enabled={false} turns={turns}>
        <p>Dedicated page conversation</p>
      </AgentConversationViewport>
    )

    expect(
      screen.queryByRole("navigation", { name: "Conversation turns" })
    ).not.toBeInTheDocument()
    const viewport = screen.getByTestId("agent-conversation-viewport")
    installViewportMetrics(viewport, {
      clientHeight: 300,
      scrollHeight: 500,
      scrollTop: 0,
    })
    act(flushAnimationFrames)
    expect(
      screen.getByRole("log", { name: "Agent conversation" })
    ).toHaveAttribute("aria-live", "polite")
    expect(viewport).toHaveAttribute("role", "region")
    expect(viewport).toHaveAccessibleName("Scrollable Agent conversation")
    expect(viewport).toHaveAttribute("tabindex", "0")
  })
})
