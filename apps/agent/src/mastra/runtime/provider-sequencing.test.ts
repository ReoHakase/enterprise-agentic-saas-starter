import { describe, expect, it } from "vitest"

import { startAgentProvidersSerially } from "./provider-sequencing"

describe("Agent provider sequencing", () => {
  it("preserves title and product results without concurrent provider requests", async () => {
    const events: string[] = []
    let activeRequests = 0
    let maximumActiveRequests = 0
    const fakeProvider = async <Result>(name: string, result: Result) => {
      events.push(`${name}:start`)
      activeRequests += 1
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests)
      await Promise.resolve()
      activeRequests -= 1
      events.push(`${name}:end`)
      return result
    }

    const result = await startAgentProvidersSerially({
      generateTitle: () =>
        fakeProvider("title", { renamed: true, title: "Issue summary" }),
      startProduct: () =>
        fakeProvider("product", { response: "The issue was summarized." }),
    })

    expect(maximumActiveRequests).toBe(1)
    expect(events).toEqual([
      "title:start",
      "title:end",
      "product:start",
      "product:end",
    ])
    expect(result).toEqual({
      product: { response: "The issue was summarized." },
      title: { renamed: true, title: "Issue summary" },
    })
  })
})
