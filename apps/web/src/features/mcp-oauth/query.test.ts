import { describe, expect, it } from "vitest"

import { parseMcpOAuthScopes } from "./query"

describe("MCP OAuth scope query", () => {
  it("projects allowlisted scopes into public descriptions", () => {
    expect(
      parseMcpOAuthScopes("issues:read files:write offline_access issues:read")
    ).toEqual([
      { description: "Read Issues", scope: "issues:read" },
      { description: "Upload and manage Issue files", scope: "files:write" },
      {
        description: "Keep access after the client is closed",
        scope: "offline_access",
      },
    ])
  })

  it.each([undefined, [], ["issues:read"], "", "issues:read private:raw"])(
    "rejects missing, repeated-query, empty, and unknown input",
    (input) => {
      expect(parseMcpOAuthScopes(input)).toBeNull()
    }
  )
})
