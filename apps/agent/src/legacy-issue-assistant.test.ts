import { describe, expect, it } from "vitest"

import { handleLegacyIssueAssistantRequest } from "./legacy-issue-assistant"

describe("legacy IssueAssistant retention class", () => {
  it("keeps the namespace unreachable without deleting retained storage", async () => {
    const response = handleLegacyIssueAssistantRequest()

    expect(response.status).toBe(410)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    await expect(response.text()).resolves.toBe("Legacy Agent session retired")
  })
})
