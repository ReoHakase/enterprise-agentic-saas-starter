import { describe, expect, it } from "vitest"

import { parseMcpOAuthStoredScopes } from "./mcp-oauth"

describe("保存済みMCP OAuth scopeの解析", () => {
  it.each([
    [["issues:read", "files:write"]],
    ['["issues:read","files:write"]'],
  ])("SQLiteとTursoのJSON表現を受理する", (input) => {
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
  ])("不正または未対応の保存済みscopeを拒否する", (input) => {
    expect(parseMcpOAuthStoredScopes(input)).toBeNull()
  })
})
