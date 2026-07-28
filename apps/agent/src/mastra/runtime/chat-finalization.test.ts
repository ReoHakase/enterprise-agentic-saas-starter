import { describe, expect, it } from "vitest"

import {
  CanonicalResponseCommitDeferredError,
  completeSuccessfulRun,
} from "./successful-run-finalization"

describe("completeSuccessfulRun", () => {
  it("schedules title generation only after Memory and application settlement", async () => {
    const order: string[] = []

    await completeSuccessfulRun({
      desiredOutcome: "completed",
      persistence: {
        stage: async (outcome) => {
          order.push(`memory-stage:${outcome}`)
        },
        commit: async () => {
          order.push("memory-and-app-settlement")
        },
      },
      recordUsage: async () => {
        order.push("main-usage")
      },
      onCommitDeferred: () => order.push("commit-deferred"),
      scheduleTitle: () => order.push("title-scheduled"),
    })

    expect(order).toEqual([
      "main-usage",
      "memory-stage:completed",
      "memory-and-app-settlement",
      "title-scheduled",
    ])
  })

  it("fails before settlement when the durable snapshot cannot be staged", async () => {
    const order: string[] = []

    await expect(
      completeSuccessfulRun({
        desiredOutcome: "waiting_approval",
        persistence: {
          stage: async () => {
            order.push("memory-stage")
            throw new Error("storage unavailable")
          },
          commit: async () => {
            order.push("memory-and-app-settlement")
          },
        },
        recordUsage: async () => {
          order.push("main-usage")
        },
        onCommitDeferred: () => order.push("commit-deferred"),
        scheduleTitle: () => order.push("title-scheduled"),
      })
    ).rejects.toThrow("storage unavailable")

    expect(order).toEqual(["main-usage", "memory-stage"])
  })

  it("retries and exposes a post-snapshot failure without discarding recovery state", async () => {
    const order: string[] = []

    await expect(
      completeSuccessfulRun({
        desiredOutcome: "completed",
        persistence: {
          stage: async () => {
            order.push("memory-stage")
          },
          commit: async () => {
            order.push("memory-commit")
            throw new Error("application settlement unavailable")
          },
        },
        recordUsage: async () => {
          order.push("main-usage")
        },
        onCommitDeferred: () => order.push("commit-deferred"),
        scheduleTitle: () => order.push("title-scheduled"),
      })
    ).rejects.toBeInstanceOf(CanonicalResponseCommitDeferredError)

    expect(order).toEqual([
      "main-usage",
      "memory-stage",
      "memory-commit",
      "memory-commit",
      "memory-commit",
      "memory-commit",
      "commit-deferred",
    ])
  })
})
