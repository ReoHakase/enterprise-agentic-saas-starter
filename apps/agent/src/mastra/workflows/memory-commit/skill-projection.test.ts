import type { MastraDBMessage } from "@mastra/core/agent"
import { describe, expect, it } from "vitest"

import { projectMemorySnapshotMessages } from "./message-projection"

const skillMessage = (name: string, result: string): MastraDBMessage => ({
  id: `message_${name}`,
  role: "assistant",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  threadId: "thread_1",
  resourceId: "resource_1",
  content: {
    format: 2,
    parts: [
      {
        type: "tool-invocation",
        toolInvocation: {
          state: "result",
          toolCallId: `call_${name}`,
          toolName: "skill",
          args: { name },
          result,
        },
      },
    ],
  },
})

describe("skill tool public projection", () => {
  it("keeps the public skill name and removes the instruction body", () => {
    const projected = projectMemorySnapshotMessages([
      skillMessage("issue-triage", "PRIVATE_SKILL_INSTRUCTIONS_SENTINEL"),
    ])

    expect(projected[0]?.content.parts).toEqual([
      expect.objectContaining({
        type: "tool-invocation",
        toolInvocation: expect.objectContaining({
          args: { name: "issue-triage" },
          result: { activated: true, name: "issue-triage" },
          toolName: "skill",
        }),
      }),
    ])
    expect(JSON.stringify(projected)).not.toContain(
      "PRIVATE_SKILL_INSTRUCTIONS_SENTINEL"
    )
  })

  it("drops unknown skills without retaining their output", () => {
    const projected = projectMemorySnapshotMessages([
      skillMessage("private-skill", "PRIVATE_UNKNOWN_SKILL_SENTINEL"),
    ])

    expect(projected[0]?.content.parts).toEqual([])
    expect(JSON.stringify(projected)).not.toContain(
      "PRIVATE_UNKNOWN_SKILL_SENTINEL"
    )
  })
})
