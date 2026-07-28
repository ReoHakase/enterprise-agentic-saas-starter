import * as v from "valibot"
import { describe, expect, it } from "vitest"

import {
  agentMemoryCommitSettlementInputSchema,
  agentMemoryCommitSettlementSchema,
} from "./runtime"

describe("memory commit contracts", () => {
  it("accepts the bounded no-grant settlement request and acknowledgement", () => {
    expect(
      v.parse(agentMemoryCommitSettlementInputSchema, {
        applicationRunId: "run_1",
      })
    ).toEqual({ applicationRunId: "run_1" })
    expect(
      v.parse(agentMemoryCommitSettlementSchema, {
        applicationRunId: "run_1",
        acknowledged: true,
      })
    ).toEqual({ applicationRunId: "run_1", acknowledged: true })
  })

  it("rejects capability overposting and invalid acknowledgements", () => {
    expect(
      v.safeParse(agentMemoryCommitSettlementInputSchema, {
        applicationRunId: "run_1",
        grant: "must-not-cross-this-boundary",
      }).success
    ).toBe(false)
    expect(
      v.safeParse(agentMemoryCommitSettlementSchema, {
        applicationRunId: "run_1",
        acknowledged: false,
      }).success
    ).toBe(false)
  })
})
