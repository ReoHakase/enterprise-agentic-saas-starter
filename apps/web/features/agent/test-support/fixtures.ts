import { TooltipProvider } from "@enterprise-agentic-saas/ui/components/tooltip"
import { Provider as JotaiProvider } from "jotai"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import { createElement, type ReactElement, type ReactNode } from "react"

import { AgentFormRegistryProvider } from "../components/form-registry/form-registry"
import { AgentRuntimeProvider } from "../components/runtime-state/runtime-state"
import type { AgentChatMessage, AgentIssueAction, AgentThread } from "../schema"

export const fictionalAgentIdentity = {
  organizationId: "org_01K1ACMECLOUD0000000000",
  organizationSlug: "acme-cloud",
  userId: "user_01K1AVERYSTONE0000000000",
} as const

export const fictionalPrimaryAgentThread = {
  id: "thread_01K1TENANTREVIEW00000000",
  title: "Review tenant access",
  titleRevision: 3,
  status: "active",
  messageCount: 8,
  createdAt: "2026-07-24T09:00:00.000Z",
  updatedAt: "2026-07-26T09:30:00.000Z",
} satisfies AgentThread

export const fictionalAgentThreads = [
  fictionalPrimaryAgentThread,
  {
    id: "thread_01K1INCIDENTPLAN00000000",
    title: "Plan incident follow-up",
    titleRevision: 1,
    status: "active",
    messageCount: 3,
    createdAt: "2026-07-25T10:00:00.000Z",
    updatedAt: "2026-07-26T08:15:00.000Z",
  },
] satisfies AgentThread[]

export const fictionalMentionCandidates = [
  {
    kind: "issue",
    id: "issue_01K1TENANTACCESS000000000",
    label: "Issue #184: Review tenant access",
  },
  {
    kind: "member",
    id: "member_01K1AVERYSTONE00000000",
    label: "Avery Stone",
  },
  {
    kind: "current_page",
    path: "/organization/acme-cloud/issues/184",
    label: "Current Issue #184",
  },
] as const

const richMarkdown = `## Access review

The **Acme Cloud** tenant boundary is enforced before every write.

| Check | Result |
| --- | --- |
| Membership | Verified |
| Organization scope | \`org_01K1ACMECLOUD0000000000\` |

\`\`\`ts
const organizationId = "org_01K1ACMECLOUD0000000000"
\`\`\`

日本語と English が混在する長文も、読みやすい位置で改行します。

The budget is $C = 128000 - 4096$ tokens.

\`\`\`mermaid
flowchart LR
  Request --> Authorization --> Repository
\`\`\`

[Review the external runbook](https://runbook.example.test/tenant-access).`

export const fictionalAgentMessages = {
  user: {
    id: "message_01K1USERREQUEST000000000",
    role: "user",
    parts: [
      {
        type: "text",
        text: "Review Issue #184 and verify the active organization boundary.",
      },
      {
        type: "data-context-reference",
        data: {
          kind: "issue",
          id: "issue_01K1TENANTACCESS000000000",
          label: "Issue #184: Review tenant access",
        },
      },
    ],
  },
  richAssistant: {
    id: "message_01K1RICHRESPONSE0000000",
    role: "assistant",
    parts: [{ type: "text", text: richMarkdown }],
  },
  reasoningAndSources: {
    id: "message_01K1REASONINGSOURCE00000",
    role: "assistant",
    parts: [
      {
        type: "reasoning",
        text: "Check membership, organization scope, then the repository filter.",
      },
      {
        type: "text",
        text: "The requested read is scoped to Acme Cloud.",
      },
      {
        type: "source-url",
        sourceId: "source_01K1ARCHITECTURE000000",
        title: "Tenant authorization architecture",
        url: "https://architecture.example.test/tenant-authorization",
      },
    ],
  },
  toolSucceeded: {
    id: "message_01K1TOOLRESULT000000000",
    role: "assistant",
    parts: [
      {
        type: "dynamic-tool",
        toolName: "get_issue",
        toolCallId: "tool_call_01K1GETISSUE000000",
        state: "output-available",
        input: { issueNumber: 184 },
        output: {
          id: "issue_01K1TENANTACCESS000000000",
          number: 184,
          title: "Review tenant access",
        },
      },
    ],
  },
  approvalPending: {
    id: "message_01K1APPROVAL0000000000",
    role: "assistant",
    parts: [
      {
        type: "dynamic-tool",
        toolName: "update_issue",
        toolCallId: "tool_call_01K1UPDATEISSUE000",
        state: "output-available",
        input: { issueNumber: 184, priority: "high" },
        output: {
          status: "pending",
          actionId: "action-pending",
        },
      },
    ],
  },
  longAssistant: {
    id: "message_01K1LONGRESPONSE000000",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: Array.from(
          { length: 12 },
          (_, index) =>
            `${index + 1}. Verify control ${index + 1} against the active organization before continuing.`
        ).join("\n"),
      },
    ],
  },
} satisfies Record<string, AgentChatMessage>

export const fictionalPendingAction = {
  id: "action-pending",
  kind: "update_issue",
  status: "pending",
  approvalMode: "manual",
  requiresApproval: true,
  preview: {
    kind: "update_issue",
    destructive: false,
    title: "Update Issue #184 priority",
    issueNumber: 184,
    issueRevision: 7,
    fields: [
      {
        field: "priority",
        before: "medium",
        after: "high",
      },
    ],
    attachments: [
      {
        assetId: "asset_01K1TENANTPOLICY000000",
        filename: "tenant-policy.png",
        sizeBytes: 2_048,
      },
    ],
  },
  previewState: "available",
  expiresAt: "2026-07-26T10:00:00.000Z",
  completedAt: null,
} satisfies AgentIssueAction

export const AgentStoryScope = ({
  children,
}: {
  children: ReactNode
}): ReactElement =>
  createElement(
    NuqsAdapter,
    null,
    createElement(
      JotaiProvider,
      null,
      createElement(
        TooltipProvider,
        null,
        createElement(
          AgentFormRegistryProvider,
          null,
          createElement(
            AgentRuntimeProvider,
            {
              organizationId: fictionalAgentIdentity.organizationId,
              userId: fictionalAgentIdentity.userId,
            },
            children
          )
        )
      )
    )
  )

export const agentContextBudgetMessages = {
  estimated: [
    {
      id: "message-budget-estimated",
      role: "assistant",
      parts: [
        {
          type: "data-context-budget",
          data: {
            contextWindowTokens: 1_000_000,
            reservedOutputTokens: 4_096,
            estimated: {
              system: 2_000,
              skills: 3_000,
              tools: 6_000,
              history: 1_000,
              pageContext: 500,
              attachments: 2,
              total: 12_502,
            },
            observedInputTokens: null,
            level: "normal",
          },
        },
      ],
    } satisfies AgentChatMessage,
  ],
  nearLimit: [
    {
      id: "message-budget-near-limit",
      role: "assistant",
      parts: [
        {
          type: "data-context-budget",
          data: {
            contextWindowTokens: 100_000,
            reservedOutputTokens: 4_096,
            estimated: {
              system: 12_000,
              skills: 8_000,
              tools: 20_000,
              history: 48_000,
              pageContext: 6_000,
              attachments: 1_000,
              total: 95_000,
            },
            observedInputTokens: 95_000,
            level: "critical",
          },
        },
      ],
    } satisfies AgentChatMessage,
  ],
} as const

export const agentConversationTurns = [
  {
    id: "turn-1",
    prompt: "Review the organization access policy.",
    response: "The current policy is scoped to the active organization.",
    imageCount: 0,
    contextCount: 1,
    toolCount: 1,
  },
  {
    id: "turn-2",
    prompt: "Summarize the highest priority Issue.",
    response: "The urgent Issue needs an owner and a due date.",
    imageCount: 0,
    contextCount: 1,
    toolCount: 1,
  },
  {
    id: "turn-3",
    prompt: "Prepare the next safe action.",
    response: "I prepared a read-only review before requesting approval.",
    imageCount: 1,
    contextCount: 1,
    toolCount: 1,
  },
] as const
