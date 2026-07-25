import type { UIMessageChunk } from "ai"
import { describe, expect, it } from "vitest"

import { addAgentStreamDataParts } from "./stream-parts"

const collect = async (
  chunks: UIMessageChunk[],
  observedInputTokens?: () => Promise<number | null>
) => {
  const projected = addAgentStreamDataParts(
    new ReadableStream<UIMessageChunk>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk)
        controller.close()
      },
    }),
    observedInputTokens
      ? {
          budget: {
            contextWindowTokens: 1_000_000,
            reservedOutputTokens: 4_096,
            estimated: {
              system: 1,
              skills: 2,
              tools: 3,
              history: 4,
              pageContext: 5,
              attachments: 6,
              total: 21,
            },
            observedInputTokens: null,
            level: "normal",
          },
          observedInputTokens,
        }
      : undefined
  )
  const values: UIMessageChunk[] = []
  const reader = projected.getReader()
  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- stream order is the assertion target.
    const { done, value } = await reader.read()
    if (done) break
    values.push(value)
  }
  return values
}

describe("addAgentStreamDataParts", () => {
  it("keeps tool state canonical and adds a bounded thread title projection", async () => {
    const chunks = await collect([
      {
        type: "tool-input-available",
        toolCallId: "call_1",
        toolName: "rename_thread",
        input: { title: "Private provider input is not copied" },
      },
      {
        type: "tool-output-available",
        toolCallId: "call_1",
        output: { renamed: true, threadId: "thread_1", title: "Outage review" },
      },
    ])

    expect(chunks).toContainEqual({
      type: "data-activity",
      id: "response-status",
      transient: true,
      data: {
        kind: "status",
        label: "応答を生成中",
        status: "running",
      },
    })
    expect(
      chunks.some(
        (chunk) =>
          chunk.type === "data-activity" &&
          typeof chunk.data === "object" &&
          chunk.data !== null &&
          Reflect.get(chunk.data, "kind") === "tool"
      )
    ).toBe(false)
    expect(chunks).toContainEqual({
      type: "data-thread-title",
      data: { renamed: true, threadId: "thread_1", title: "Outage review" },
    })
  })

  it("does not emit title data for malformed or unmatched output", async () => {
    const chunks = await collect([
      {
        type: "tool-output-available",
        toolCallId: "unmatched",
        output: { renamed: true, threadId: "thread_1", title: "Ignored" },
      },
      {
        type: "tool-input-available",
        toolCallId: "call_2",
        toolName: "rename_thread",
        input: {},
      },
      {
        type: "tool-output-available",
        toolCallId: "call_2",
        output: { renamed: "yes", threadId: "bad id", title: "" },
      },
    ])

    expect(chunks.some((chunk) => chunk.type === "data-thread-title")).toBe(
      false
    )
  })

  it("appends provider-observed input separately from the estimate", async () => {
    const chunks = await collect([], () => Promise.resolve(123))

    expect(chunks).toContainEqual({
      type: "data-context-budget",
      data: expect.objectContaining({
        estimated: expect.objectContaining({ total: 21 }),
        observedInputTokens: 123,
      }),
    })
  })

  it("omits the final projection when provider usage is unavailable", async () => {
    const chunks = await collect([], () => Promise.resolve(null))

    expect(chunks).toEqual([
      {
        type: "data-activity",
        id: "response-status",
        transient: true,
        data: {
          kind: "status",
          label: "応答を生成中",
          status: "running",
        },
      },
      {
        type: "data-activity",
        id: "response-status",
        transient: true,
        data: {
          kind: "status",
          label: "応答を生成中",
          status: "completed",
        },
      },
    ])
  })
})
