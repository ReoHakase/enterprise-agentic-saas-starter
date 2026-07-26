import { expect, fn, userEvent, waitFor } from "storybook/test"

import preview from "#storybook/preview"
import { AgentFormRegistryProvider } from "@/features/agent"

import {
  fictionalIssueAssignees,
  fictionalIssueSearchState,
  fictionalIssueView,
} from "../../test-support/fixtures"
import { IssuesWorkspace } from "./issues-workspace"

const createIssue = fn(async () => undefined)
const toggleIssue = fn(async () => undefined)
const deleteIssue = fn(async () => undefined)
const updateIssue = fn(async () => undefined)
const selectIssue = fn()
const retry = fn()
const search = fn()
const changeView = fn(async () => new URLSearchParams())

const meta = preview.meta({
  title: "Web/Issues/Issues Workspace",
  component: IssuesWorkspace,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <AgentFormRegistryProvider>
        <div className="mx-auto max-w-7xl">
          <Story />
        </div>
      </AgentFormRegistryProvider>
    ),
  ],
  args: {
    issues: [fictionalIssueView],
    organizationId: fictionalIssueView.organizationId,
    searchState: fictionalIssueSearchState,
    total: 1,
    pageSize: 10,
    assignees: fictionalIssueAssignees,
    getIssueHref: (issue) => `/organization/acme/issues/${issue.number}`,
    onCreate: createIssue,
    onToggle: toggleIssue,
    onDelete: deleteIssue,
    onUpdate: updateIssue,
    onSelectIssue: selectIssue,
    onRetry: retry,
    onSearchChange: search,
    onViewChange: changeView,
  },
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, canvasElement, step }) => {
    const ownerBody = canvasElement.ownerDocument.body

    await step("Search and open the row action menu", async () => {
      const searchInput = canvas.getByRole("searchbox", {
        name: "Search issues",
      })
      await userEvent.type(searchInput, "billing")
      await waitFor(() => expect(search).toHaveBeenCalledWith("billing"))
      const actions = canvas.getByRole("button", {
        name: `Actions for ${fictionalIssueView.title}`,
      })
      await userEvent.click(actions)
      await waitFor(() =>
        expect(actions).toHaveAttribute("aria-expanded", "true")
      )
      await userEvent.keyboard("{Escape}")
      await waitFor(() =>
        expect(actions).toHaveAttribute("aria-expanded", "false")
      )
      await waitFor(
        () =>
          expect(
            ownerBody.querySelector("[data-base-ui-focus-guard]")
          ).not.toBeInTheDocument(),
        { timeout: 3_000 }
      )
    })
  },
})

export const Empty = meta.story({
  args: { issues: [], total: 0 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No matching issues")).toBeVisible()
  },
})

export const Error = meta.story({
  args: {
    issues: [],
    total: 0,
    error: "The issue list request failed.",
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }))
    await expect(retry).toHaveBeenCalled()
  },
})

export const Pending = meta.story({
  args: {
    pending: true,
    busyIssueId: fictionalIssueView.id,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "New issue" })
    ).toBeDisabled()
    await expect(
      canvas.getByRole("button", {
        name: `Actions for ${fictionalIssueView.title}`,
      })
    ).toHaveAttribute("aria-busy", "true")
  },
})

export const MobileOverflow = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("region", { name: "Organization issues" })
    ).toBeInTheDocument()
  },
})
