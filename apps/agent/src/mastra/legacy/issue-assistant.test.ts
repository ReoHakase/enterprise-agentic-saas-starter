import { describe, expect, it } from "vitest"

import { IssueAssistant } from "./issue-assistant"

describe("legacy IssueAssistant retention class", () => {
  it("keeps the namespace unreachable without deleting retained storage", async () => {
    const response = new IssueAssistant().fetch(
      new Request("https://agent.example/legacy")
    )

    expect(response.status).toBe(410)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    await expect(response.text()).resolves.toBe("Legacy Agent session retired")
  })
})
