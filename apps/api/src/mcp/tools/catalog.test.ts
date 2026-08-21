import type {
  AgentAccountContext,
  AgentIssueDetail,
} from "@enterprise-agentic-saas/agent-contracts"
import type { McpPermissionScope } from "@enterprise-agentic-saas/auth/mcp-oauth"
import type { Db } from "@enterprise-agentic-saas/db"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { McpPrincipal } from "../principal"
import { createMcpServer } from "../server"
import { createMcpTools } from "./catalog"
import { createMcpReadApplication } from "./read-application"
import type { createMcpWriteApplication } from "./write-application"

vi.mock("./read-application", () => ({
  createMcpReadApplication: vi.fn<typeof createMcpReadApplication>(),
}))

vi.mock("./write-application", () => ({
  createMcpWriteApplication: vi.fn<typeof createMcpWriteApplication>(() =>
    JSON.parse("{}")
  ),
}))

type ReadApplication = ReturnType<typeof createMcpReadApplication>

const unavailable = <Output>(): Promise<Output> =>
  Promise.reject(new Error("unreachable"))

const unavailableReadApplication: ReadApplication = {
  getAttachmentUploadStatus: unavailable,
  getIssue: unavailable,
  readAccountContext: unavailable,
  readActiveOrganization: unavailable,
  readIssueAttachmentImage: unavailable,
  searchIssueLabels: unavailable,
  searchIssues: unavailable,
  searchOrganizationMembers: unavailable,
}

const invalidValue = <Output>(privateUrl: string): Output =>
  JSON.parse(JSON.stringify({ privateUrl }))

const db: Db = JSON.parse("{}")

const principal = (scope: McpPermissionScope): McpPrincipal => ({
  audience: "https://api.example.test/mcp",
  clientId: "mcp-client-a",
  organizationId: "mcp-org-a",
  role: "owner",
  scopes: new Set([scope]),
  type: "oauth-user",
  userId: "mcp-user-a",
})

const readErrorChain = (value: unknown) => {
  const chain: unknown[] = []
  let current = value
  for (let depth = 0; depth < 4; depth += 1) {
    chain.push(current)
    if (!(current instanceof Error)) break
    current = current.cause
  }
  return chain
}

const expectSafeMcpFailure = async (
  operation: Promise<unknown>,
  secret?: string
) => {
  const failure = await operation.then(
    () => undefined,
    (error: unknown) => error
  )
  expect(failure).toBeInstanceOf(Error)
  const chain = readErrorChain(failure)
  expect(
    chain.some(
      (error) =>
        typeof error === "object" &&
        error !== null &&
        Reflect.get(error, "code") === "retryable_internal"
    )
  ).toBe(true)
  if (secret) {
    for (const error of chain) {
      expect(String(error)).not.toContain(secret)
      expect(JSON.stringify(error) ?? "").not.toContain(secret)
    }
  }
}

const invalidOutputCases: Array<{
  method: "get_issue" | "read_account_context"
  read: ReadApplication
  scope: McpPermissionScope
  secret: string
}> = [
  {
    method: "read_account_context",
    scope: "account:read",
    secret: "private-account-output-sentinel",
    read: {
      ...unavailableReadApplication,
      readAccountContext: () =>
        Promise.resolve(
          invalidValue<AgentAccountContext>("private-account-output-sentinel")
        ),
    },
  },
  {
    method: "get_issue",
    scope: "issues:read",
    secret: "private-issue-output-sentinel",
    read: {
      ...unavailableReadApplication,
      getIssue: () =>
        Promise.resolve(
          invalidValue<AgentIssueDetail>("private-issue-output-sentinel")
        ),
    },
  },
]

describe("MCP catalog boundary validation", () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(invalidOutputCases)(
    "maps invalid $method output to a safe MCP error",
    async ({ method, read, scope, secret }) => {
      expect.hasAssertions()
      vi.mocked(createMcpReadApplication).mockReturnValue(read)
      const server = createMcpServer({
        tools: createMcpTools(db, principal(scope)),
      })

      await expectSafeMcpFailure(
        server.executeTool(
          method,
          method === "get_issue" ? { lookup: "id", id: "issue_1" } : {}
        ),
        secret
      )
    }
  )

  it("rejects mixed and missing get_issue lookups before application execution", async () => {
    const getIssue = vi.fn<ReadApplication["getIssue"]>(() => unavailable())
    vi.mocked(createMcpReadApplication).mockReturnValue({
      ...unavailableReadApplication,
      getIssue,
    })
    const server = createMcpServer({
      tools: createMcpTools(db, principal("issues:read")),
    })

    await expectSafeMcpFailure(
      server.executeTool("get_issue", {
        id: "issue_1",
        lookup: "id",
        number: 1,
      })
    )
    await expectSafeMcpFailure(
      server.executeTool("get_issue", { lookup: "id" })
    )
    expect(getIssue).not.toHaveBeenCalled()
  })
})
