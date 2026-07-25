import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { parseAgentEvalDataset } from "./dataset"

const readDataset = async () => {
  const value: unknown = JSON.parse(
    await readFile(
      resolve(import.meta.dirname, "../../../evals/cases.json"),
      "utf8"
    )
  )
  return value
}

describe("Agent eval dataset", () => {
  it("parses the two direct stack cases", async () => {
    const dataset = parseAgentEvalDataset(await readDataset())
    expect(dataset.cases.map((item) => [item.id, item.trials])).toEqual([
      ["agent-stack-read", 3],
      ["agent-stack-approved-write", 3],
    ])
  })

  it("rejects duplicate case IDs", async () => {
    const raw = await readDataset()
    if (!raw || typeof raw !== "object") throw new Error("Missing dataset")
    const cases = Reflect.get(raw, "cases")
    if (!Array.isArray(cases) || !cases[0]) throw new Error("Missing cases")
    cases.push(structuredClone(cases[0]))
    expect(() => parseAgentEvalDataset(raw)).toThrow("duplicate")
  })
})
