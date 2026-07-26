import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { IssueListItem } from "../../schema"
import type { IssueUiItem, IssuesWorkspaceProps } from "../types/types"
import { IssuesDashboard } from "./client"

type MutationOptions = {
  mutationFn: (...args: unknown[]) => unknown
  onSuccess: (...args: unknown[]) => unknown
  onError: (...args: unknown[]) => unknown
  onMutate: (...args: unknown[]) => unknown
  onSettled: (...args: unknown[]) => unknown
}

type DashboardMocks = {
  createIssue: ReturnType<
    typeof vi.fn<(client: unknown, input: unknown) => Promise<unknown>>
  >
  createIssueAsync: ReturnType<
    typeof vi.fn<(title: string) => Promise<unknown>>
  >
  dashboardProps: IssuesWorkspaceProps | undefined
  deleteIssue: ReturnType<
    typeof vi.fn<(client: unknown, input: unknown) => Promise<unknown>>
  >
  deleteIssueAsync: ReturnType<
    typeof vi.fn<(issue: IssueUiItem) => Promise<unknown>>
  >
  getConsoleApiErrorText: ReturnType<
    typeof vi.fn<(error: unknown, fallback: string) => string>
  >
  invalidateQueries: ReturnType<typeof vi.fn<(input: unknown) => Promise<void>>>
  issueQueryError: Error | undefined
  mutationOptions: MutationOptions[]
  push: ReturnType<typeof vi.fn<(href: string) => void>>
  refetch: ReturnType<typeof vi.fn<() => Promise<void>>>
  setDiscrete: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>
  setSearch: ReturnType<
    typeof vi.fn<(input: { q: string; page: number }) => Promise<void>>
  >
  showConsoleApiErrorToast: ReturnType<
    typeof vi.fn<(error: unknown, fallback: string) => void>
  >
  toastSuccess: ReturnType<typeof vi.fn<(message: string) => void>>
  updateIssue: ReturnType<
    typeof vi.fn<(client: unknown, input: unknown) => Promise<unknown>>
  >
  updateIssueAsync: ReturnType<
    typeof vi.fn<
      (input: { issue: IssueUiItem; update: unknown }) => Promise<unknown>
    >
  >
}

const mocks = vi.hoisted<DashboardMocks>(() => ({
  createIssue: vi.fn<(client: unknown, input: unknown) => Promise<unknown>>(),
  createIssueAsync: vi.fn<(title: string) => Promise<unknown>>(),
  dashboardProps: undefined,
  deleteIssue: vi.fn<(client: unknown, input: unknown) => Promise<unknown>>(),
  deleteIssueAsync: vi.fn<(issue: IssueUiItem) => Promise<unknown>>(),
  getConsoleApiErrorText: vi.fn<(error: unknown, fallback: string) => string>(
    () => "Safe issue error"
  ),
  invalidateQueries: vi.fn<(input: unknown) => Promise<void>>(),
  issueQueryError: undefined,
  mutationOptions: [],
  push: vi.fn<(href: string) => void>(),
  refetch: vi.fn<() => Promise<void>>(),
  setDiscrete: vi.fn<(...args: unknown[]) => void>(),
  setSearch: vi.fn<(input: { q: string; page: number }) => Promise<void>>(),
  showConsoleApiErrorToast: vi.fn<(error: unknown, fallback: string) => void>(),
  toastSuccess: vi.fn<(message: string) => void>(),
  updateIssue: vi.fn<(client: unknown, input: unknown) => Promise<unknown>>(),
  updateIssueAsync:
    vi.fn<
      (input: { issue: IssueUiItem; update: unknown }) => Promise<unknown>
    >(),
}))

const issue: IssueListItem = {
  id: "issue-42",
  organizationId: "org-acme",
  number: 42,
  title: "Retry failed invoice delivery",
  description: "Retry safely and report the final delivery state.",
  status: "open",
  priority: "high",
  assigneeId: "user-2",
  creatorId: "user-1",
  labels: ["billing", "reliability"],
  dueDate: "2026-08-03T09:30:00.000Z",
  revision: 3,
  createdAt: "2026-07-20T08:00:00.000Z",
  updatedAt: "2026-07-25T12:30:00.000Z",
  attachmentCount: 2,
  commentCount: 4,
  thumbnail: null,
}

vi.mock("@/features/console", () => ({
  getConsoleApiErrorText: mocks.getConsoleApiErrorText,
  membersQueryOptions: () => ({ queryKey: ["members"] }),
  showConsoleApiErrorToast: mocks.showConsoleApiErrorToast,
}))

vi.mock("@/lib/api-client", () => ({ apiClient: {} }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess },
}))

vi.mock("@tanstack/react-query", () => {
  let queryCall = 0
  let mutationCall = 0

  return {
    useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
    useQuery: () => {
      const call = queryCall++ % 2

      if (call === 0) {
        return {
          data: mocks.issueQueryError
            ? undefined
            : { items: [issue], pageSize: 20, total: 1 },
          error: mocks.issueQueryError,
          refetch: mocks.refetch,
        }
      }

      return {
        data: [
          {
            userId: "user-2",
            name: "Jordan Lee",
            email: "jordan@example.test",
            profileImage: null,
          },
        ],
      }
    },
    useMutation: (options: MutationOptions) => {
      const call = mutationCall++ % 3
      mocks.mutationOptions[call] = options

      if (call === 0) {
        return {
          isPending: false,
          mutateAsync: mocks.createIssueAsync,
        }
      }
      if (call === 1) {
        return {
          isPending: true,
          mutateAsync: mocks.updateIssueAsync,
        }
      }
      return { mutateAsync: mocks.deleteIssueAsync }
    },
  }
})

vi.mock("../../api", () => ({
  createIssue: mocks.createIssue,
  deleteIssue: mocks.deleteIssue,
  updateIssue: mocks.updateIssue,
}))

vi.mock("../../queries", () => ({
  issueKeys: { lists: (organizationId: string) => ["issues", organizationId] },
  issuesQueryOptions: () => ({ queryKey: ["issues"] }),
}))

vi.mock("../../search-params", () => ({
  useIssueSearchState: () => ({
    state: {
      agentThread: "thread-7",
      assignee: "all",
      page: 1,
      priority: "all",
      q: "",
      status: "all",
    },
    setDiscrete: mocks.setDiscrete,
    setSearch: mocks.setSearch,
  }),
}))

vi.mock("../../search-params.shared", () => ({
  withAgentThreadHref: (href: string, thread: string) =>
    `${href}?agentThread=${thread}`,
}))

vi.mock("../issues-workspace/issues-workspace", () => ({
  IssuesWorkspace: (props: IssuesWorkspaceProps) => {
    mocks.dashboardProps = props
    return (
      <section aria-label="Dashboard probe">
        <span>{props.issues[0]?.title ?? "No issues"}</span>
        <span>{props.assignees?.[0]?.email ?? "No assignees"}</span>
        <span>{props.error ?? "No error"}</span>
      </section>
    )
  },
}))

describe("IssuesDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.dashboardProps = undefined
    mocks.issueQueryError = undefined
    mocks.mutationOptions.length = 0
    mocks.createIssue.mockResolvedValue({})
    mocks.deleteIssue.mockResolvedValue({})
    mocks.invalidateQueries.mockResolvedValue()
    mocks.updateIssue.mockResolvedValue({})
  })

  it("maps realistic issue data and connects workspace actions", async () => {
    render(
      <IssuesDashboard
        organizationId="org-acme"
        organizationSlug="acme-cloud"
      />
    )

    expect(
      screen.getByText("Retry failed invoice delivery")
    ).toBeInTheDocument()
    expect(screen.getByText("jordan@example.test")).toBeInTheDocument()
    expect(screen.getByText("No error")).toBeInTheDocument()

    const props = mocks.dashboardProps
    expect(props).toBeDefined()
    if (!props) throw new Error("Expected dashboard props")

    const mappedIssue = props.issues.at(0)
    expect(mappedIssue).toBeDefined()
    if (!mappedIssue) throw new Error("Expected a mapped issue")
    expect(mappedIssue).toMatchObject({
      id: "issue-42",
      number: 42,
      attachmentCount: 2,
      commentCount: 4,
    })
    expect(props.pending).toBe(true)

    await props.onCreate("  Investigate billing  ")
    expect(mocks.createIssueAsync).toHaveBeenCalledWith("Investigate billing")

    await props.onToggle(mappedIssue)
    expect(mocks.updateIssueAsync).toHaveBeenCalledWith({
      issue: mappedIssue,
      update: { status: "closed" },
    })

    await props.onToggle({ ...mappedIssue, status: "closed" })
    expect(mocks.updateIssueAsync).toHaveBeenLastCalledWith({
      issue: { ...mappedIssue, status: "closed" },
      update: { status: "open" },
    })

    await props.onUpdate?.(mappedIssue, { priority: "urgent" })
    await props.onDelete(mappedIssue)
    expect(mocks.deleteIssueAsync).toHaveBeenCalledWith(mappedIssue)

    props.onSelectIssue(mappedIssue)
    expect(mocks.push).toHaveBeenCalledWith(
      "/organization/acme-cloud/issues/42?agentThread=thread-7"
    )
    expect(props.getIssueHref(mappedIssue)).toBe(
      "/organization/acme-cloud/issues/42?agentThread=thread-7"
    )

    props.onSearchChange("invoice")
    expect(mocks.setSearch).toHaveBeenCalledWith({ q: "invoice", page: 1 })

    props.onRetry?.()
    expect(mocks.refetch).toHaveBeenCalledOnce()
  })

  it("executes mutation lifecycle callbacks and exposes safe errors", async () => {
    mocks.issueQueryError = new Error("private provider error")
    render(
      <IssuesDashboard
        organizationId="org-acme"
        organizationSlug="acme-cloud"
      />
    )

    expect(screen.getByText("Safe issue error")).toBeInTheDocument()
    expect(mocks.getConsoleApiErrorText).toHaveBeenCalledWith(
      mocks.issueQueryError,
      "The issue list request failed."
    )

    const viewIssue: IssueUiItem = {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      description: issue.description,
      status: issue.status,
      priority: issue.priority,
      assigneeId: issue.assigneeId,
      creatorId: issue.creatorId,
      labels: issue.labels,
      dueDate: issue.dueDate,
      revision: issue.revision,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      attachmentCount: issue.attachmentCount,
      commentCount: issue.commentCount,
      thumbnail: issue.thumbnail,
    }
    const createOptions = mocks.mutationOptions.at(0)
    const updateOptions = mocks.mutationOptions.at(1)
    const deleteOptions = mocks.mutationOptions.at(2)
    if (!createOptions || !updateOptions || !deleteOptions) {
      throw new Error("Expected mutation options")
    }

    await createOptions.mutationFn("Created from dashboard")
    expect(mocks.createIssue).toHaveBeenCalledWith(
      {},
      {
        organizationId: "org-acme",
        title: "Created from dashboard",
      }
    )
    await createOptions.onSuccess()
    createOptions.onError(new Error("create"))

    updateOptions.onMutate({
      issue: viewIssue,
      update: { priority: "urgent" },
    })
    await updateOptions.mutationFn({
      issue: viewIssue,
      update: { priority: "urgent" },
    })
    await updateOptions.onSuccess()
    updateOptions.onError(new Error("update"))
    updateOptions.onSettled()

    deleteOptions.onMutate(viewIssue)
    await deleteOptions.mutationFn(viewIssue)
    await deleteOptions.onSuccess()
    deleteOptions.onError(new Error("delete"))
    deleteOptions.onSettled()

    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["issues", "org-acme"],
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Issue created")
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Issue updated")
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Issue deleted")
    expect(mocks.showConsoleApiErrorToast).toHaveBeenCalledTimes(3)
  })
})
