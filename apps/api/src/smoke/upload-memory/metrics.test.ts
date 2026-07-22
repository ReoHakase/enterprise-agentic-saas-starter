import { describe, expect, it } from "vitest"

import {
  parseConcurrency,
  parseProcessRows,
  summarizeProcessMemory,
} from "./metrics"

describe("upload memory smoke metrics", () => {
  it("measures only workerd processes below the owned Wrangler tree", () => {
    const rows = parseProcessRows(`
      100 1 10000 bun
      101 100 20000 node
      102 101 30000 /nix/store/example/bin/workerd
      103 102 4000 helper
      200 1 90000 workerd
    `)

    expect(summarizeProcessMemory(rows, 100)).toEqual({
      processTreeRssKiB: 64_000,
      workerdPids: [102],
      workerdRssKiB: 30_000,
      workerdSingleProcessMaxRssKiB: 30_000,
    })
  })

  it("requires bounded concurrent execution", () => {
    expect(parseConcurrency(["--concurrency=8"], undefined)).toBe(8)
    expect(() => parseConcurrency(["--concurrency=1"], undefined)).toThrow(
      "concurrency must be an integer"
    )
    expect(() => parseConcurrency(["--concurrency=4.5"], undefined)).toThrow(
      "concurrency must be an integer"
    )
  })
})
