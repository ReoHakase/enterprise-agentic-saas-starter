import type { ComponentProps } from "react"

import preview from "#storybook/preview"
import { Providers } from "@/components/providers/providers"
import { AgentFormRegistryProvider } from "@/features/agent"

import {
  fictionalIssue,
  fictionalIssueAssignees,
  fictionalIssueTimeline,
} from "../../test-support/fixtures"
import { IssueDetailController } from "./issue-detail-controller"

const issueDetailArgs = {
  initialIssue: fictionalIssue,
  initialTimeline: fictionalIssueTimeline,
  assignees: fictionalIssueAssignees,
  labelSuggestions: ["billing", "bug", "security"],
  organizationId: fictionalIssue.organizationId,
  canonicalHref: "/organization/acme/issues/12",
} satisfies ComponentProps<typeof IssueDetailController>

const meta = preview.meta({
  title: "Web/Issues/Issue Detail",
  component: IssueDetailController,
  tags: ["autodocs"],
  parameters: { disableGlobalToaster: true },
  decorators: [
    (Story) => (
      <Providers>
        <AgentFormRegistryProvider>
          <div className="mx-auto max-w-5xl">
            <Story />
          </div>
        </AgentFormRegistryProvider>
      </Providers>
    ),
  ],
  args: issueDetailArgs,
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
})

export const LongContent = meta.story({
  args: {
    initialIssue: {
      ...fictionalIssue,
      title:
        "Investigate tenant authorization failures across imported repositories",
      description:
        "The customer provided a long diagnostic report. Preserve organization boundaries, verify repository scope, and document every retry decision before shipping the remediation.",
    },
  },
})
