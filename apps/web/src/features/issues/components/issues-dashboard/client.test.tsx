import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, waitFor } from "@testing-library/react"
import type { PropsWithChildren } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  fictionalIssue,
  fictionalIssueListItem,
} from "../../test-support/fixtures"
import type { IssueUiItem, IssuesWorkspaceProps } from "../types"
import { IssuesDashboard } from "./client"

type DashboardMocks = {
  createIssue: ReturnType<
    typeof vi.fn<(client: unknown, input: unknown) => Promise<unknown>>
  >
  dashboardProps: IssuesWorkspaceProps | undefined
  deleteIssue: ReturnType<
    typeof vi.fn<(client: unknown, input: unknown) => Promise<unknown>>
  >
  getConsoleApiErrorText: ReturnType<
    typeof vi.fn<(error: unknown, fallback: string) => string>
  >
  listIssueLabels: ReturnType<
    typeof vi.fn<(...args: unknown[]) => Promise<unknown>>
  >
  listIssues: ReturnType<typeof vi.fn<(...args: unknown[]) => Promise<unknown>>>
  listMembers: ReturnType<typeof vi.fn<() => Promise<unknown>>>
  routerNavigate: ReturnType<typeof vi.fn<(input: { href: string }) => void>>
  setDiscrete: ReturnType<typeof vi.fn<(...args: unknown[]) => Promise<void>>>
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
}

const mocks = vi.hoisted<DashboardMocks>(() => ({
  createIssue: vi.fn<(client: unknown, input: unknown) => Promise<unknown>>(),
  dashboardProps: undefined,
  deleteIssue: vi.fn<(client: unknown, input: unknown) => Promise<unknown>>(),
  getConsoleApiErrorText: vi.fn<(error: unknown, fallback: string) => string>(),
  listIssueLabels: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  listIssues: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  listMembers: vi.fn<() => Promise<unknown>>(),
  routerNavigate: vi.fn<(input: { href: string }) => void>(),
  setDiscrete: vi.fn<(...args: unknown[]) => Promise<void>>(),
  setSearch: vi.fn<(input: { q: string; page: number }) => Promise<void>>(),
  showConsoleApiErrorToast: vi.fn<(error: unknown, fallback: string) => void>(),
  toastSuccess: vi.fn<(message: string) => void>(),
  updateIssue: vi.fn<(client: unknown, input: unknown) => Promise<unknown>>(),
}))

vi.mock("@/features/console", () => ({
  getConsoleApiErrorText: mocks.getConsoleApiErrorText,
  membersQueryOptions: (organizationId: string) => ({
    queryKey: ["members", organizationId],
    queryFn: () => mocks.listMembers(),
  }),
  showConsoleApiErrorToast: mocks.showConsoleApiErrorToast,
}))

vi.mock("@/lib/api-client", () => ({ apiClient: {} }))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.routerNavigate,
}))

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess },
}))

vi.mock("../../api", () => ({
  createIssue: mocks.createIssue,
  deleteIssue: mocks.deleteIssue,
  listIssueLabels: mocks.listIssueLabels,
  listIssues: mocks.listIssues,
  updateIssue: mocks.updateIssue,
}))

vi.mock("../../use-issue-search-state", () => ({
  useIssueSearchState: () => ({
    state: {
      agentThread: "thread-7",
      assignees: [],
      labels: [],
      labelMode: "any",
      dueFrom: "",
      dueTo: "",
      page: 1,
      pageSize: "20",
      priorityFrom: "no_priority",
      priorityTo: "urgent",
      q: "",
      statuses: [],
      sort: "updatedAt",
      dir: "desc",
    },
    setDiscrete: mocks.setDiscrete,
    setSearch: mocks.setSearch,
  }),
}))

vi.mock("../issues-workspace/issues-workspace", () => ({
  IssuesWorkspace: (props: IssuesWorkspaceProps) => {
    mocks.dashboardProps = props
    return (
      <section aria-label="Dashboard probe">
        <span>{props.issues[0]?.title ?? "No issues"}</span>
        <span>{props.assignees?.[0]?.email ?? "No assignees"}</span>
      </section>
    )
  },
}))

const members = [
  {
    id: "member-2",
    userId: "user-2",
    name: "Jordan Lee",
    email: "jordan@example.test",
    profileImage: null,
    role: "admin",
    createdAt: "2026-07-02T00:00:00.000Z",
  },
]

const renderDashboard = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false, staleTime: Infinity },
    },
  })
  const Wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  render(
    <IssuesDashboard organizationId="org-acme" organizationSlug="acme-cloud" />,
    { wrapper: Wrapper }
  )
}

const getDashboardProps = async () => {
  await screen.findByText(fictionalIssueListItem.title)
  await waitFor(() => expect(mocks.dashboardProps).toBeDefined())
  const props = mocks.dashboardProps
  if (!props) throw new Error("Dashboard props were not published")
  return props
}

const getIssue = (props: IssuesWorkspaceProps): IssueUiItem => {
  const issue = props.issues.at(0)
  if (!issue) throw new Error("Issue was not mapped")
  return issue
}

describe("IssuesDashboardのWorkspace境界", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.dashboardProps = undefined
    mocks.createIssue.mockResolvedValue(fictionalIssue)
    mocks.deleteIssue.mockResolvedValue(fictionalIssue)
    mocks.getConsoleApiErrorText.mockReturnValue("Safe issue error")
    mocks.listIssueLabels.mockResolvedValue(["billing", "incident"])
    mocks.listIssues.mockResolvedValue({
      items: [fictionalIssueListItem],
      page: 1,
      pageSize: 20,
      total: 1,
    })
    mocks.listMembers.mockResolvedValue(members)
    mocks.setDiscrete.mockResolvedValue(undefined)
    mocks.setSearch.mockResolvedValue(undefined)
    mocks.updateIssue.mockResolvedValue(fictionalIssue)
  })

  it("取得結果をWorkspaceの公開値へ写像する", async () => {
    renderDashboard()

    const props = await getDashboardProps()

    expect(getIssue(props)).toMatchObject({
      id: fictionalIssueListItem.id,
      number: fictionalIssueListItem.number,
      attachmentCount: fictionalIssueListItem.attachmentCount,
      commentCount: fictionalIssueListItem.commentCount,
    })
    expect(screen.getByText("jordan@example.test")).toBeInTheDocument()
  })

  it("作成題名を正規化してAPIへ送る", async () => {
    renderDashboard()
    const props = await getDashboardProps()

    await act(async () => props.onCreate("  Investigate billing  "))

    expect(mocks.createIssue).toHaveBeenCalledWith(
      {},
      { organizationId: "org-acme", title: "Investigate billing" }
    )
  })

  it("状態切替時に次の状態をAPIへ送る", async () => {
    renderDashboard()
    const props = await getDashboardProps()
    const issue = getIssue(props)

    await act(async () => props.onToggle(issue))

    expect(mocks.updateIssue).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        id: issue.id,
        organizationId: "org-acme",
        status: "closed",
      })
    )
  })

  it("指定差分でIssueを更新する", async () => {
    renderDashboard()
    const props = await getDashboardProps()
    const issue = getIssue(props)

    await act(async () => props.onUpdate?.(issue, { priority: "urgent" }))

    expect(mocks.updateIssue).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        id: issue.id,
        organizationId: "org-acme",
        priority: "urgent",
      })
    )
  })

  it("Issueを削除する", async () => {
    renderDashboard()
    const props = await getDashboardProps()
    const issue = getIssue(props)

    await act(async () => props.onDelete(issue))

    expect(mocks.deleteIssue).toHaveBeenCalledWith(
      {},
      { id: issue.id, organizationId: "org-acme" }
    )
  })

  it("選択時にAgent threadを保った詳細URLへ遷移する", async () => {
    renderDashboard()
    const props = await getDashboardProps()
    const issue = getIssue(props)

    props.onSelectIssue(issue)

    const href = `/organization/acme-cloud/issues/${issue.number.toString()}?agentThread=thread-7`
    expect(mocks.routerNavigate).toHaveBeenCalledWith({ href })
    expect(props.getIssueHref(issue)).toBe(href)
  })

  it("検索変更時に1ページ目から再検索する", async () => {
    renderDashboard()
    const props = await getDashboardProps()

    props.onSearchChange("invoice")

    expect(mocks.setSearch).toHaveBeenCalledWith({ q: "invoice", page: 1 })
  })
})
