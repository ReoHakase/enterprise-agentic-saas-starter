import { http, HttpResponse } from "msw"
import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"
import { Providers } from "@/components/providers/providers"
import { AgentFormRegistryProvider } from "@/features/agent"

import { createDeferred } from "../../../../test-support/storybook/deferred"
import type { IssueListItem } from "../../schema"
import {
  fictionalIssue,
  fictionalIssueListItem,
} from "../../test-support/fixtures"
import { IssuesDashboard } from "./client"

const organizationId = "org_01K1ACMECLOUD0000000000"
const issueTitle = fictionalIssueListItem.title
const filteredIssue = {
  ...fictionalIssueListItem,
  id: "issue_01K1FILTERED000000000",
  number: 21,
  title: "Filtered production result",
  status: "in_progress" as const,
}
let issueQueryRequests: string[] = []
type Deferred<Value> = ReturnType<typeof createDeferred<Value>>
let filteredIssueRequestStarted: Deferred<void>
let filteredIssueResponseGate: Deferred<void>
let staleLabelRequestStarted: Deferred<void>
let staleLabelResponseGate: Deferred<void>
let staleLabelResponseReturned: Deferred<void>
const members = [
  {
    id: "member_01K1JORDAN000000000000",
    userId: "user_01K1JORDAN0000000000000",
    name: "Jordan Lee",
    email: "jordan@example.test",
    profileImage: null,
    role: "admin",
    createdAt: "2026-07-02T00:00:00.000Z",
  },
]

const DashboardScope = ({ children }: { children: React.ReactNode }) => (
  <Providers>
    <AgentFormRegistryProvider>
      <div className="mx-auto max-w-7xl">{children}</div>
    </AgentFormRegistryProvider>
  </Providers>
)

const issueHandlers = (initialIssues: IssueListItem[]) => {
  let issues = [...initialIssues]

  return [
    http.get("*/issues/labels", () =>
      HttpResponse.json({ items: ["billing", "incident"] })
    ),
    http.get("*/issues", () =>
      HttpResponse.json({
        items: issues,
        page: 1,
        pageSize: 20,
        total: issues.length,
      })
    ),
    http.get("*/organizations/:organizationId/members", () =>
      HttpResponse.json(members)
    ),
    http.post("*/issues", async ({ request }) => {
      const payload: unknown = await request.json()
      const requestedTitle =
        payload && typeof payload === "object"
          ? Reflect.get(payload, "title")
          : undefined
      const created = {
        ...fictionalIssue,
        id: "issue_01K1CREATED00000000000",
        number: 13,
        title:
          typeof requestedTitle === "string"
            ? requestedTitle
            : "Created from Storybook",
      }
      issues = [
        ...issues,
        { ...created, attachmentCount: 0, commentCount: 0, thumbnail: null },
      ]
      return HttpResponse.json(created, { status: 201 })
    }),
    http.patch("*/issues/:issueId", async ({ params, request }) => {
      const payload: unknown = await request.json()
      const current =
        issues.find((issue) => issue.id === String(params.issueId)) ??
        fictionalIssueListItem
      const patch =
        payload && typeof payload === "object"
          ? Object.fromEntries(
              Object.entries(payload).filter(([, value]) => value !== undefined)
            )
          : {}
      const updated = { ...current, ...patch, revision: current.revision + 1 }
      issues = issues.map((issue) =>
        issue.id === updated.id ? { ...issue, ...updated } : issue
      )
      return HttpResponse.json(updated)
    }),
    http.delete("*/issues/:issueId", ({ params }) => {
      const deleted =
        issues.find((issue) => issue.id === String(params.issueId)) ??
        fictionalIssueListItem
      issues = issues.filter((issue) => issue.id !== deleted.id)
      return HttpResponse.json(deleted)
    }),
  ]
}

const meta = preview.meta({
  title: "Web/Issues/Issues Dashboard",
  component: IssuesDashboard,
  tags: ["autodocs"],
  parameters: { disableGlobalToaster: true },
  decorators: [
    (Story) => (
      <DashboardScope>
        <Story />
      </DashboardScope>
    ),
  ],
  args: {
    organizationId,
    organizationSlug: "acme",
    currentUserId: members[0]?.userId,
  },
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
  beforeEach({ msw }) {
    msw.use(...issueHandlers([fictionalIssueListItem]))
  },
})

export const CreateSuccess = meta.story({
  beforeEach({ msw }) {
    msw.use(...issueHandlers([fictionalIssueListItem]))
  },
  play: async ({ canvas, canvasElement, step }) => {
    const ownerBody = canvasElement.ownerDocument.body
    const body = within(ownerBody)

    await step("決定的なAPI応答でIssueを作成する", async () => {
      await expect(await canvas.findByText(issueTitle)).toBeVisible()
      await userEvent.click(canvas.getByRole("button", { name: "New issue" }))
      await userEvent.type(
        body.getByRole("textbox", { name: "Title" }),
        "Prepare release notes"
      )
      await userEvent.click(body.getByRole("button", { name: "Create issue" }))
      await expect(await body.findByText("Issue created")).toBeInTheDocument()
      await expect(
        await canvas.findByText("Prepare release notes")
      ).toBeVisible()
      await waitFor(() =>
        expect(
          body.queryByRole("dialog", { name: "Create issue" })
        ).not.toBeInTheDocument()
      )
    })
  },
})

export const UpdateSuccess = meta.story({
  beforeEach({ msw }) {
    msw.use(...issueHandlers([fictionalIssueListItem]))
  },
  play: async ({ canvas, canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)

    await step("決定的なAPI応答でIssueを更新する", async () => {
      await expect(await canvas.findByText(issueTitle)).toBeVisible()
      await waitFor(() =>
        expect(
          canvas.getByRole("button", {
            name: `Actions for ${issueTitle}`,
          })
        ).toBeEnabled()
      )
      const actions = canvas.getByRole("button", {
        name: `Actions for ${issueTitle}`,
      })
      await userEvent.click(actions)
      const menu = await body.findByRole(
        "menu",
        {
          name: `Actions for ${issueTitle}`,
        },
        { timeout: 5_000 }
      )
      await waitFor(() => expect(menu).toBeVisible())
      await userEvent.click(
        within(menu).getByRole("menuitem", { name: "Close issue" })
      )
      await expect(await body.findByText("Issue updated")).toBeInTheDocument()
      await waitFor(() => expect(menu).not.toBeInTheDocument())
    })
  },
})

export const DeleteSuccess = meta.story({
  beforeEach({ msw }) {
    msw.use(...issueHandlers([fictionalIssueListItem]))
  },
  play: async ({ canvas, canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)

    await step("破壊的操作を確認してIssueを削除する", async () => {
      await expect(await canvas.findByText(issueTitle)).toBeVisible()
      await waitFor(() =>
        expect(
          canvas.getByRole("button", {
            name: `Actions for ${issueTitle}`,
          })
        ).toBeEnabled()
      )
      const actions = canvas.getByRole("button", {
        name: `Actions for ${issueTitle}`,
      })
      await userEvent.click(actions)
      const menu = await body.findByRole("menu", {
        name: `Actions for ${issueTitle}`,
      })
      await waitFor(() => expect(menu).toBeVisible())
      await userEvent.click(
        within(menu).getByRole("menuitem", { name: "Delete issue" })
      )
      const dialog = await body.findByRole(
        "alertdialog",
        {
          name: "Delete this issue?",
        },
        { timeout: 5_000 }
      )
      await expect(dialog).toBeInTheDocument()
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Delete issue" })
      )
      await expect(await body.findByText("Issue deleted")).toBeInTheDocument()
      await waitFor(() => expect(dialog).not.toBeInTheDocument())
    })
  },
})

export const Empty = meta.story({})

export const QueryIntegrationContract = meta.story({
  beforeEach({ msw }) {
    issueQueryRequests = []
    filteredIssueRequestStarted = createDeferred<void>()
    filteredIssueResponseGate = createDeferred<void>()
    msw.use(
      http.get("*/issues/labels", () =>
        HttpResponse.json({ items: ["billing", "incident"] })
      ),
      http.get("*/issues", async ({ request }) => {
        const url = new URL(request.url)
        issueQueryRequests.push(url.toString())
        if (url.searchParams.getAll("statuses").includes("in_progress")) {
          filteredIssueRequestStarted.resolve(undefined)
          await filteredIssueResponseGate.promise
          return HttpResponse.json({
            items: [filteredIssue],
            page: 1,
            pageSize: 20,
            total: 1,
          })
        }
        return HttpResponse.json({
          items: [fictionalIssueListItem],
          page: 1,
          pageSize: 20,
          total: 1,
        })
      }),
      http.get("*/organizations/:organizationId/members", () =>
        HttpResponse.json(members)
      )
    )
    return () => {
      filteredIssueResponseGate.resolve(undefined)
    }
  },
  play: async ({ canvas, canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)
    await step("絞り込み中は直前行を維持して完了後に置き換える", async () => {
      await expect(await canvas.findByText(issueTitle)).toBeVisible()

      const statusTrigger = canvas.getByRole("combobox", { name: "Status" })
      await userEvent.click(statusTrigger)
      const statusListbox = await body.findByRole("listbox")
      await userEvent.click(
        await body.findByRole("option", { name: "In progress" })
      )
      await expect(canvas.getByText(issueTitle)).toBeVisible()

      await userEvent.click(statusTrigger)
      await waitFor(() => expect(statusListbox).not.toBeVisible())
      await filteredIssueRequestStarted.promise
      expect(
        new URL(
          issueQueryRequests.at(-1) ?? "https://invalid.test"
        ).searchParams.getAll("statuses")
      ).toEqual(["in_progress"])
      await expect(canvas.getByText(issueTitle)).toBeVisible()
      filteredIssueResponseGate.resolve(undefined)
      await expect(await canvas.findByText(filteredIssue.title)).toBeVisible()
    })
  },
})

export const StaleLabelResponse = meta.story({
  beforeEach({ msw }) {
    staleLabelRequestStarted = createDeferred<void>()
    staleLabelResponseGate = createDeferred<void>()
    staleLabelResponseReturned = createDeferred<void>()
    msw.use(
      http.get("*/issues/labels", async ({ request }) => {
        const url = new URL(request.url)
        const search = url.searchParams.get("search") ?? ""
        if (search === "b") {
          staleLabelRequestStarted.resolve(undefined)
          await staleLabelResponseGate.promise
          staleLabelResponseReturned.resolve(undefined)
          return HttpResponse.json({ items: ["obsolete"] })
        }
        if (search === "bi") {
          return HttpResponse.json({ items: ["billing-new"] })
        }
        return HttpResponse.json({ items: ["billing", "incident"] })
      }),
      http.get("*/issues", () =>
        HttpResponse.json({
          items: [fictionalIssueListItem],
          page: 1,
          pageSize: 20,
          total: 1,
        })
      ),
      http.get("*/organizations/:organizationId/members", () =>
        HttpResponse.json(members)
      )
    )
    return () => {
      staleLabelResponseGate.resolve(undefined)
    }
  },
  play: async ({ canvas, canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)

    await step("遅い旧ラベル応答で新しい候補を上書きしない", async () => {
      await expect(await canvas.findByText(issueTitle)).toBeVisible()
      const labelsTrigger = canvas.getByRole("button", { name: "Labels" })
      await userEvent.click(labelsTrigger)
      const search = await body.findByRole("combobox", {
        name: "Search labels",
      })
      await userEvent.type(search, "b")
      await staleLabelRequestStarted.promise
      await userEvent.type(search, "i")
      await expect(
        await body.findByRole("option", { name: "billing-new" })
      ).toBeVisible()
      staleLabelResponseGate.resolve(undefined)
      await staleLabelResponseReturned.promise
      await waitFor(() => {
        expect(
          body.queryByRole("option", { name: "obsolete" })
        ).not.toBeInTheDocument()
        expect(body.getByRole("option", { name: "billing-new" })).toBeVisible()
      })
    })
  },
})

export const RetrySuccess = meta.story({
  beforeEach({ msw }) {
    let attempt = 0
    msw.use(
      http.get("*/issues", () => {
        attempt += 1
        return attempt === 1
          ? HttpResponse.json(
              {
                error: "validation_error",
                message: "Issue list unavailable.",
              },
              { status: 400 }
            )
          : HttpResponse.json({
              items: [fictionalIssueListItem],
              page: 1,
              pageSize: 20,
              total: 1,
            })
      }),
      http.get("*/organizations/:organizationId/members", () =>
        HttpResponse.json(members)
      )
    )
  },
  play: async ({ canvas, step }) => {
    await step("一覧取得を再試行して成功する", async () => {
      await expect(
        await canvas.findByText("Issues could not be loaded")
      ).toBeVisible()
      await userEvent.click(canvas.getByRole("button", { name: "Try again" }))
      await expect(await canvas.findByText(issueTitle)).toBeVisible()
    })
  },
})

export const CreateFailure = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.post("*/issues", () =>
        HttpResponse.json(
          {
            error: "service_unavailable",
            message: "The service is temporarily unavailable.",
          },
          { status: 503 }
        )
      ),
      ...issueHandlers([fictionalIssueListItem])
    )
  },
  play: async ({ canvas, canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)

    await step("作成失敗後も作成Dialogを開いたままにする", async () => {
      await canvas.findByText(issueTitle)
      await userEvent.click(canvas.getByRole("button", { name: "New issue" }))
      await userEvent.type(
        body.getByRole("textbox", { name: "Title" }),
        "Rejected issue"
      )
      await userEvent.click(body.getByRole("button", { name: "Create issue" }))
      await expect(
        await body.findByText(/The issue could not be created/)
      ).toBeVisible()
      await expect(
        body.getByRole("dialog", { name: "Create issue" })
      ).toBeInTheDocument()
    })
  },
})

export const UpdateFailure = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.patch("*/issues/:issueId", () =>
        HttpResponse.json(
          {
            error: "service_unavailable",
            message: "The service is temporarily unavailable.",
          },
          { status: 503 }
        )
      ),
      ...issueHandlers([fictionalIssueListItem])
    )
  },
  play: async ({ canvas, canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)

    await step("行を維持したまま更新失敗を通知する", async () => {
      await canvas.findByText(issueTitle)
      const actions = canvas.getByRole("button", {
        name: `Actions for ${issueTitle}`,
      })
      await waitFor(() => expect(actions).toBeEnabled())
      await userEvent.click(actions)
      const menu = await body.findByRole("menu", {
        name: `Actions for ${issueTitle}`,
      })
      await waitFor(() => expect(menu).toBeVisible())
      await userEvent.click(
        within(menu).getByRole("menuitem", { name: "Close issue" })
      )
      await expect(
        await body.findByText(/Issue update failed/)
      ).toBeInTheDocument()
      await expect(canvas.getByText(issueTitle)).toBeVisible()
      await waitFor(() => expect(menu).not.toBeInTheDocument())
    })
  },
})

export const DeleteFailure = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.delete("*/issues/:issueId", () =>
        HttpResponse.json(
          {
            error: "service_unavailable",
            message: "The service is temporarily unavailable.",
          },
          { status: 503 }
        )
      ),
      ...issueHandlers([fictionalIssueListItem])
    )
  },
  play: async ({ canvas, canvasElement, step }) => {
    const ownerBody = canvasElement.ownerDocument.body
    const body = within(ownerBody)

    await step("行を維持したまま削除失敗を通知する", async () => {
      await canvas.findByText(issueTitle)
      const getActions = () =>
        canvas.getByRole("button", {
          name: `Actions for ${issueTitle}`,
        })
      await waitFor(() => expect(getActions()).toBeEnabled())
      await userEvent.click(getActions())
      const menu = await body.findByRole("menu", {
        name: `Actions for ${issueTitle}`,
      })
      await waitFor(() => expect(menu).toBeVisible())
      await userEvent.click(
        within(menu).getByRole("menuitem", { name: "Delete issue" })
      )
      const dialog = await body.findByRole(
        "alertdialog",
        {
          name: "Delete this issue?",
        },
        { timeout: 5_000 }
      )
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Delete issue" })
      )
      await expect(
        await body.findByText(/Issue deletion failed/)
      ).toBeInTheDocument()
      await waitFor(() => expect(dialog).not.toBeInTheDocument())
      await expect(canvas.getByText(issueTitle)).toBeVisible()
    })
  },
})

export const MutationPending = meta.story({
  tags: ["manual", "!test"],
  beforeEach({ msw }) {
    msw.use(
      ...issueHandlers([fictionalIssueListItem]),
      http.post("*/issues", async () => {
        await new Promise(() => undefined)
        return HttpResponse.json(fictionalIssue)
      })
    )
  },
})
