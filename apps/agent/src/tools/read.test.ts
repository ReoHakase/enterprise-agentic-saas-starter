import type {
  AgentIssue,
  AgentIssueDetail,
} from "@enterprise-agentic-saas/api/agent-client"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import type { AgentInternalGateway } from "../control-plane/client"
import { createAgentToolBudget } from "./budget"
import {
  agentReadToolSchemas,
  createAgentIssueImageHandler,
  createAgentReadHandlers,
  createAgentReadTools,
  issueAttachmentImageToModelOutput,
} from "./read"
import { createAgentVisionBudget } from "./vision-budget"

const RUN_GRANT = "run_0123456789abcdefghijklmnopqrstuvwxyz"

type AgentReadApi = Pick<
  AgentInternalGateway,
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
  revision: 1,
  status: "open",
  title: "Issue",
  updatedAt: "2026-07-22T00:00:00.000Z",
})

const issueDetail = (description = "description"): AgentIssueDetail => ({
  ...issue(description),
  attachments: { items: [], nextCursor: null },
})

const apiHarness = (options: { failAccount?: boolean } = {}) => {
  const grants: string[] = []
  const api: AgentReadApi = {
    getIssue: (input) => {
      grants.push(input.grant)
      return Promise.resolve(issueDetail())
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
  it("keeps every provider schema JSON-serializable", () => {
    for (const schema of Object.values(agentReadToolSchemas)) {
      expect(() => z.toJSONSchema(schema)).not.toThrow()
    }
  })

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
      "Agent tool limit reached"
    )
    expect(test.grants).toHaveLength(20)
  })

  it("replaces private HTTP errors with a fixed tool error", async () => {
    const test = apiHarness({ failAccount: true })
    const handlers = createAgentReadHandlers(test.api, RUN_GRANT)

    await expect(handlers.readAccountContext()).rejects.toThrow(
      "Agent read capability is unavailable"
    )
    await expect(handlers.readAccountContext()).rejects.not.toThrow(RUN_GRANT)
  })
})

describe("Issue attachment image sidecar", () => {
  it("keeps canonical output metadata-only and consumes the WeakMap sidecar once", async () => {
    const getIssueAttachmentImageForModel = vi.fn<
      AgentInternalGateway["getIssueAttachmentImageForModel"]
    >(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: {
            "content-length": "3",
            "content-type": "image/webp",
          },
        })
    )
    const visionBudget = createAgentVisionBudget()
    const handler = createAgentIssueImageHandler(
      { getIssueAttachmentImageForModel },
      RUN_GRANT,
      createAgentToolBudget(),
      visionBudget
    )

    const output = await handler({
      issueId: "issue_1",
      fileId: "file_1",
    })

    expect(output).toEqual({
      issueId: "issue_1",
      fileId: "file_1",
      contentType: "image/webp",
      sizeBytes: 3,
    })
    expect(JSON.stringify(output)).not.toMatch(
      /base64|data:|https?:|objectKey|AQID/
    )
    expect(visionBudget.includedCount()).toBe(1)

    const modelOutput = issueAttachmentImageToModelOutput(output)
    expect(modelOutput.value).toContainEqual({
      type: "media",
      data: "AQID",
      mediaType: "image/webp",
    })
    expect(() => issueAttachmentImageToModelOutput(output)).toThrow(
      "Issue attachment image is unavailable"
    )
  })

  it("shares the four-image run limit with current-message images", async () => {
    const getIssueAttachmentImageForModel = vi.fn<
      AgentInternalGateway["getIssueAttachmentImageForModel"]
    >(
      async () =>
        new Response(new Uint8Array([1]), {
          headers: {
            "content-length": "1",
            "content-type": "image/webp",
          },
        })
    )
    const visionBudget = createAgentVisionBudget(3)
    const handler = createAgentIssueImageHandler(
      { getIssueAttachmentImageForModel },
      RUN_GRANT,
      createAgentToolBudget(),
      visionBudget
    )
    const first = await handler({ issueId: "issue_1", fileId: "file_1" })
    issueAttachmentImageToModelOutput(first)

    await expect(
      handler({ issueId: "issue_1", fileId: "file_2" })
    ).rejects.toThrow("Agent image input limit reached")
    expect(getIssueAttachmentImageForModel).toHaveBeenCalledTimes(1)
    expect(visionBudget.includedCount()).toBe(4)
  })
})
