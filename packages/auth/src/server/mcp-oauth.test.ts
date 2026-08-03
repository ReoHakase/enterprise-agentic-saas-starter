import { describe, expect, it } from "vitest"

import { parseMcpOAuthStoredScopes } from "./mcp-oauth"

describe("parseMcpOAuthStoredScopes", () => {
  it.each([
    [["issues:read", "files:write"]],
    ['["issues:read","files:write"]'],
  ])("accepts SQLite and Turso JSON representations", (input) => {
    expect(parseMcpOAuthStoredScopes(input)).toEqual([
      "issues:read",
      "files:write",
    ])
  })

  it.each([
    null,
    "not-json",
    '{"scope":"issues:read"}',
    '["issues:read",42]',
    '["issues:read","private:raw"]',
    "x".repeat(4097),
  ])("rejects malformed or unsupported stored scopes", (input) => {
    expect(parseMcpOAuthStoredScopes(input)).toBeNull()
  })
})
