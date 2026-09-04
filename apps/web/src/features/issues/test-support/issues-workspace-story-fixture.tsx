import { AgentFormRegistryProvider } from "@/features/agent"

import { IssuesWorkspace } from "../components/issues-workspace/issues-workspace"
import type { IssuesWorkspaceProps } from "../components/types"
import {
  fictionalIssueAssignees,
  fictionalIssueSearchState,
  fictionalIssueView,
} from "./fixtures"

const ignore = () => undefined
const ignoreAsync = async () => undefined
const ignoreViewChange = async () => new URLSearchParams()

export const tallIssueViews = Array.from({ length: 20 }, (_, index) => ({
  ...fictionalIssueView,
  id: `${fictionalIssueView.id}-${index}`,
  number: fictionalIssueView.number + index,
  title:
    index === 0
      ? fictionalIssueView.title
      : `${fictionalIssueView.title} ${index}`,
}))

export const activeIssueSearchState = {
  ...fictionalIssueSearchState,
  statuses: ["open", "closed"],
  priorityFrom: "medium",
  priorityTo: "urgent",
  assignees: ["unassigned", fictionalIssueAssignees[0]?.id ?? "user-1"],
  labels: ["billing", "incident"],
  labelMode: "all",
  dueFrom: "2026-06-07",
  dueTo: "2026-06-18",
} satisfies IssuesWorkspaceProps["searchState"]

const defaultProps = {
  issues: [fictionalIssueView],
  organizationId: fictionalIssueView.organizationId,
  currentUserId: fictionalIssueAssignees[0]?.id ?? "user-1",
  searchState: fictionalIssueSearchState,
  total: 1,
  pageSize: 20,
  assignees: fictionalIssueAssignees,
  labelOptions: ["billing", "incident"],
  onLabelSearchChange: ignore,
  getIssueHref: (issue) => `/organization/acme/issues/${issue.number}`,
  onCreate: ignoreAsync,
  onToggle: ignoreAsync,
  onDelete: ignoreAsync,
  onUpdate: ignoreAsync,
  onSelectIssue: ignore,
  onRetry: ignore,
  onSearchChange: ignore,
  onViewChange: ignoreViewChange,
} satisfies IssuesWorkspaceProps

export const IssuesWorkspaceStoryFixture = (
  props: Partial<IssuesWorkspaceProps>
) => (
  <AgentFormRegistryProvider>
    <IssuesWorkspace {...defaultProps} {...props} />
  </AgentFormRegistryProvider>
)

const requireClosest = (
  element: HTMLElement,
  selector: string,
  message: string
) => {
  const match = element.closest<HTMLElement>(selector)
  if (!match) throw new Error(message)
  return match
}

export const getIssueControlSurfaces = ({
  action,
  checkbox,
}: {
  action: HTMLElement
  checkbox: HTMLElement
}) => ({
  actionIsland: requireClosest(
    action,
    '[data-slot="issue-actions-island"]',
    "Expected the issue actions island"
  ),
  selectionIsland: requireClosest(
    checkbox,
    '[data-slot="data-table-selection-island"]',
    "Expected the issue selection island"
  ),
})

export const getIssueActionsHeader = (columnTrigger: HTMLElement) =>
  requireClosest(columnTrigger, "th", "Expected the issue actions table header")

export const getIssueResultsScope = (selectionStatus: HTMLElement) =>
  requireClosest(
    selectionStatus,
    '[data-slot="issues-table-results-scope"]',
    "Expected the issue results scope"
  )

export const getVisibleDirectControlRowCenters = (group: HTMLElement) =>
  Array.from(group.children).reduce<number[]>((centers, child) => {
    if (!(child instanceof HTMLElement)) return centers
    const rect = child.getBoundingClientRect()
    if (rect.height === 0 || rect.width === 0) return centers
    const center = (rect.top + rect.bottom) / 2
    if (!centers.some((candidate) => Math.abs(candidate - center) <= 1)) {
      centers.push(center)
    }
    return centers
  }, [])

export const getAssigneeSummaryParts = (trigger: HTMLElement) => {
  const avatar = trigger.querySelector<HTMLElement>(
    '[data-slot="avatar-group"]'
  )
  const count = trigger.querySelector<HTMLElement>(
    '[aria-hidden="true"]:last-child'
  )
  if (!(avatar && count)) {
    throw new Error("Expected the assignee summary parts")
  }
  return { avatar, count }
}

export const getComputedColorAlpha = (color: string) => {
  if (color === "transparent") return 0
  const legacyAlpha = color.match(/^rgba\(.+,\s*([\d.]+)\)$/u)?.[1]
  if (legacyAlpha) return Number(legacyAlpha)
  const modernAlpha = color.match(/\/\s*([\d.]+)\s*\)$/u)?.[1]
  return modernAlpha ? Number(modernAlpha) : 1
}
