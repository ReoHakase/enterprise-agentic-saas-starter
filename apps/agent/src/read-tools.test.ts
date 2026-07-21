import type {
  AgentInternalApiContract,
  AgentIssue,
} from "@enterprise-agentic-saas/api/agent-client"
import { describe, expect, it } from "vitest"

import {
  agentReadToolSchemas,
  createAgentReadHandlers,
  createAgentReadTools,
} from "./read-tools"

const RUN_GRANT = "run_0123456789abcdefghijklmnopqrstuvwxyz"

type AgentReadApi = Pick<
  AgentInternalApiContract,
  | "getIssue"
  | "readAccountContext"
  | "readActiveOrganization"
  | "searchIssueLabels"
  | "searchIssues"
  | "searchOrganizationMembers"
>

const issue = (description = "description"): AgentIssue => ({
  assigneeId: null,
  createdAt: "2026-07-22T00:00:00.000Z",
  description,
  dueDate: null,
  id: "issue_1",
  labels: ["bug"],
  number: 1,
  priority: "medium",
  status: "open",
  title: "Issue",
  updatedAt: "2026-07-22T00:00:00.000Z",
})

const apiHarness = (options: { failAccount?: boolean } = {}) => {
  const grants: string[] = []
  const api: AgentReadApi = {
    getIssue: (input) => {
      grants.push(input.grant)
      return Promise.resolve(issue())
    },
    readAccountContext: (input) => {
      grants.push(input.grant)
      if (options.failAccount) {
        return Promise.reject(new Error(`private error ${RUN_GRANT}`))
      }
      return Promise.resolve({ name: "User", profileImage: null })
    },
    readActiveOrganization: (input) => {
      grants.push(input.grant)
      return Promise.resolve({
        name: "Example",
        permissions: {
          canCreateIssues: true,
          canDeleteAnyIssue: false,
          canDeleteOwnIssues: true,
          canReadIssues: true,
          canUpdateIssues: true,
        },
        role: "member",
        slug: "example",
      })
    },
    searchIssueLabels: (input) => {
      grants.push(input.grant)
      return Promise.resolve([{ label: "bug", usageCount: 1 }])
    },
    searchIssues: (input) => {
      grants.push(input.grant)
      return Promise.resolve([issue("x".repeat(3_000))])
    },
    searchOrganizationMembers: (input) => {
      grants.push(input.grant)
      return Promise.resolve([
        { id: "member_1", name: "Member", profileImage: null, role: "member" },
      ])
    },
  }
  return { api, grants }
}

describe("Agent read tool schemas", () => {
  it("rejects unknown fields and values beyond the bounded contracts", () => {
    expect(
      agentReadToolSchemas.empty.safeParse({ grant: RUN_GRANT }).success
    ).toBe(false)
    expect(
      agentReadToolSchemas.memberSearch.safeParse({ limit: 51 }).success
    ).toBe(false)
    expect(
      agentReadToolSchemas.labelSearch.safeParse({ query: "x".repeat(41) })
        .success
    ).toBe(false)
    expect(
      agentReadToolSchemas.issueSearch.safeParse({ status: "unknown" }).success
    ).toBe(false)
    expect(
      agentReadToolSchemas.getIssue.safeParse({ lookup: "number", number: 0 })
        .success
    ).toBe(false)
  })

  it("applies bounded defaults to list reads", () => {
    expect(agentReadToolSchemas.memberSearch.parse({})).toEqual({ limit: 20 })
    expect(agentReadToolSchemas.issueSearch.parse({})).toEqual({ limit: 20 })
  })
})

describe("createAgentReadHandlers", () => {
  it("exposes only the six bounded read tools", () => {
    const test = apiHarness()

    expect(
      Object.keys(createAgentReadTools(test.api, RUN_GRANT)).toSorted()
    ).toEqual([
      "get_issue",
      "read_account_context",
      "read_active_organization",
      "search_issue_labels",
      "search_issues",
      "search_organization_members",
    ])
  })

  it("injects only the run grant into every API capability", async () => {
    const test = apiHarness()
    const handlers = createAgentReadHandlers(test.api, RUN_GRANT)

    const results = await Promise.all([
      handlers.readAccountContext(),
      handlers.readActiveOrganization(),
      handlers.searchOrganizationMembers({ limit: 10 }),
      handlers.searchIssueLabels({ limit: 10 }),
      handlers.searchIssues({ limit: 10 }),
      handlers.getIssue({ lookup: "number", number: 1 }),
    ])

    expect(test.grants).toEqual(Array.from({ length: 6 }, () => RUN_GRANT))
    expect(JSON.stringify(results)).not.toContain(RUN_GRANT)
  })

  it("bounds Issue descriptions returned by list search", async () => {
    const test = apiHarness()
    const handlers = createAgentReadHandlers(test.api, RUN_GRANT)

    const results = await handlers.searchIssues({ limit: 10 })

    expect(results[0]?.description).toHaveLength(2_001)
    expect(results[0]?.description.endsWith("…")).toBe(true)
  })

  it("stops after the per-run read tool budget", async () => {
    const test = apiHarness()
    const handlers = createAgentReadHandlers(test.api, RUN_GRANT)
    await Promise.all(
      Array.from({ length: 20 }, () => handlers.readAccountContext())
    )

    await expect(handlers.readAccountContext()).rejects.toThrow(
      "Agent read tool limit reached"
    )
    expect(test.grants).toHaveLength(20)
  })

  it("replaces internal RPC errors with a fixed tool error", async () => {
    const test = apiHarness({ failAccount: true })
    const handlers = createAgentReadHandlers(test.api, RUN_GRANT)

    await expect(handlers.readAccountContext()).rejects.toThrow(
      "Agent read capability is unavailable"
    )
    await expect(handlers.readAccountContext()).rejects.not.toThrow(RUN_GRANT)
  })
})
