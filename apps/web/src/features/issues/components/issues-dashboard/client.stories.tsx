import { http, HttpResponse } from "msw"
import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"
import { Providers } from "@/components/providers/providers"
import { AgentFormRegistryProvider } from "@/features/agent"

import { createDeferred } from "../../../../../test-support/storybook/deferred"
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
let labelQueryRequests: string[] = []
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
  play: async ({ canvas, canvasElement, step }) => {
    const ownerBody = canvasElement.ownerDocument.body
    const body = within(ownerBody)

    await step(
      "Create an issue with a deterministic API response",
      async () => {
        await expect(await canvas.findByText(issueTitle)).toBeVisible()
        await userEvent.click(canvas.getByRole("button", { name: "New issue" }))
        await userEvent.type(
          body.getByRole("textbox", { name: "Title" }),
          "Prepare release notes"
        )
        await userEvent.click(
          body.getByRole("button", { name: "Create issue" })
        )
        await expect(await body.findByText("Issue created")).toBeInTheDocument()
        await expect(
          await canvas.findByText("Prepare release notes")
        ).toBeVisible()
        await waitFor(() =>
          expect(
            body.queryByRole("dialog", { name: "Create issue" })
          ).not.toBeInTheDocument()
        )
      }
    )

    await step(
      "Update an issue from its keyboard-accessible menu",
      async () => {
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
        await waitFor(() => expect(menu).toHaveFocus())
        await userEvent.keyboard("{ArrowDown}{ArrowDown}")
        await waitFor(() =>
          expect(
            body.getByRole("menuitem", { name: "Close issue" })
          ).toHaveFocus()
        )
        await userEvent.keyboard("{Enter}")
        await expect(await body.findByText("Issue updated")).toBeInTheDocument()
        await waitFor(() =>
          expect(
            body.queryByRole("menu", {
              name: `Actions for ${issueTitle}`,
            })
          ).not.toBeInTheDocument()
        )
      }
    )

    await step("Delete an issue after destructive confirmation", async () => {
      const actions = canvas.getByRole("button", {
        name: `Actions for ${issueTitle}`,
      })
      await userEvent.click(actions)
      const menu = await body.findByRole("menu", {
        name: `Actions for ${issueTitle}`,
      })
      await waitFor(() => expect(menu).toBeVisible())
      await waitFor(() => expect(menu).toHaveFocus())
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
      await waitFor(() =>
        expect(
          body.queryByRole("alertdialog", { name: "Delete this issue?" })
        ).not.toBeInTheDocument()
      )
    })
  },
})

export const Empty = meta.story({
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No matching issues")).toBeVisible()
  },
})

export const QueryIntegrationContract = meta.story({
  beforeEach({ msw }) {
    issueQueryRequests = []
    labelQueryRequests = []
    filteredIssueRequestStarted = createDeferred<void>()
    filteredIssueResponseGate = createDeferred<void>()
    staleLabelRequestStarted = createDeferred<void>()
    staleLabelResponseGate = createDeferred<void>()
    staleLabelResponseReturned = createDeferred<void>()
    msw.use(
      http.get("*/issues/labels", async ({ request }) => {
        const url = new URL(request.url)
        labelQueryRequests.push(url.toString())
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
      staleLabelResponseGate.resolve(undefined)
    }
  },
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await expect(await canvas.findByText(issueTitle)).toBeVisible()
    expect(issueQueryRequests).toHaveLength(1)

    await userEvent.click(canvas.getByRole("combobox", { name: "Status" }))
    const statusListbox = await body.findByRole("listbox")
    await userEvent.click(
      await body.findByRole("option", { name: "In progress" })
    )
    expect(issueQueryRequests).toHaveLength(1)
    await expect(canvas.getByText(issueTitle)).toBeVisible()

    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(statusListbox).not.toBeVisible())
    await filteredIssueRequestStarted.promise
    expect(issueQueryRequests).toHaveLength(2)
    expect(
      new URL(
        issueQueryRequests[1] ?? "https://invalid.test"
      ).searchParams.getAll("statuses")
    ).toEqual(["in_progress"])
    await expect(canvas.getByText(issueTitle)).toBeVisible()
    await expect(
      canvas.getByRole("status", { name: "Updating issues" })
    ).toBeVisible()
    await expect(
      canvas.getByRole("button", { name: `Actions for ${issueTitle}` })
    ).toBeDisabled()
    filteredIssueResponseGate.resolve(undefined)
    await expect(await canvas.findByText(filteredIssue.title)).toBeVisible()

    const labelsTrigger = canvas.getByRole("button", { name: "Labels" })
    await userEvent.click(labelsTrigger)
    const search = await body.findByRole("combobox", {
      name: "Search labels",
    })
    await userEvent.type(search, "b")
    await staleLabelRequestStarted.promise
    expect(
      labelQueryRequests.some(
        (request) => new URL(request).searchParams.get("search") === "b"
      )
    ).toBe(true)
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
    const labelsListbox = body.getByRole("listbox")
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(labelsTrigger).toHaveFocus())
    await waitFor(() => expect(labelsListbox).not.toBeVisible())
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
    await step("Retry the list request successfully", async () => {
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

    await step("Keep the create dialog open after API failure", async () => {
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

    await step("Report an update failure without losing the row", async () => {
      await canvas.findByText(issueTitle)
      const getActions = () =>
        canvas.getByRole("button", {
          name: `Actions for ${issueTitle}`,
        })
      await waitFor(() => expect(getActions()).toBeEnabled())
      await userEvent.click(getActions())
      await waitFor(() =>
        expect(getActions()).toHaveAttribute("aria-expanded", "true")
      )
      const menu = body.getByRole("menu", {
        name: `Actions for ${issueTitle}`,
      })
      await waitFor(() => expect(menu).toBeVisible())
      await waitFor(() => expect(menu).toHaveFocus())
      await userEvent.click(
        within(menu).getByRole("menuitem", { name: "Close issue" })
      )
      await expect(
        await body.findByText(/Issue update failed/)
      ).toBeInTheDocument()
      await expect(canvas.getByText(issueTitle)).toBeVisible()
      await waitFor(() =>
        expect(getActions()).toHaveAttribute("aria-busy", "false")
      )
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

    await step("Report a deletion failure without losing the row", async () => {
      await canvas.findByText(issueTitle)
      const getActions = () =>
        canvas.getByRole("button", {
          name: `Actions for ${issueTitle}`,
        })
      await waitFor(() => expect(getActions()).toBeEnabled())
      await userEvent.click(getActions())
      await waitFor(() =>
        expect(getActions()).toHaveAttribute("aria-expanded", "true")
      )
      const menu = body.getByRole("menu", {
        name: `Actions for ${issueTitle}`,
      })
      await waitFor(() => expect(menu).toBeVisible())
      await waitFor(() => expect(menu).toHaveFocus())
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
      await waitFor(() => expect(dialog).not.toBeVisible())
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
