import { http, HttpResponse } from "msw"
import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"
import { Providers } from "@/components/providers/providers"
import { AgentFormRegistryProvider } from "@/features/agent"

import type { IssueListItem } from "../../schema"
import {
  fictionalIssue,
  fictionalIssueListItem,
} from "../../test-support/fixtures"
import { IssuesDashboard } from "./client"

const organizationId = "org_01K1ACMECLOUD0000000000"
const issueTitle = fictionalIssueListItem.title
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
    http.get("*/issues", () =>
      HttpResponse.json({
        items: issues,
        page: 1,
        pageSize: 10,
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
        await waitFor(
          () =>
            expect(
              ownerBody.querySelector("[data-base-ui-focus-guard]")
            ).not.toBeInTheDocument(),
          { timeout: 3_000 }
        )
      }
    )

    await step("Delete an issue after destructive confirmation", async () => {
      const actions = canvas.getByRole("button", {
        name: `Actions for ${issueTitle}`,
      })
      actions.focus()
      await waitFor(() => expect(actions).toHaveFocus())
      await userEvent.keyboard("{Enter}")
      const menu = await body.findByRole("menu", {
        name: `Actions for ${issueTitle}`,
      })
      await waitFor(() =>
        expect(
          within(menu).getByRole("menuitem", { name: "View details" })
        ).toHaveFocus()
      )
      await userEvent.keyboard("{End}")
      await waitFor(() =>
        expect(
          body.getByRole("menuitem", { name: "Delete issue" })
        ).toHaveFocus()
      )
      await userEvent.keyboard("{Enter}")
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
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No matching issues")).toBeVisible()
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
                error: {
                  code: "issue_list_unavailable",
                  message: "Issue list unavailable.",
                },
              },
              { status: 400 }
            )
          : HttpResponse.json({
              items: [fictionalIssueListItem],
              page: 1,
              pageSize: 10,
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
            error: {
              code: "internal_error",
              message: "Request failed.",
            },
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
            error: {
              code: "internal_error",
              message: "Request failed.",
            },
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
      const actions = canvas.getByRole("button", {
        name: `Actions for ${issueTitle}`,
      })
      await userEvent.click(actions)
      const closeIssue = await body.findByRole("menuitem", {
        name: "Close issue",
      })
      await userEvent.click(closeIssue)
      await expect(
        await body.findByText(/Issue update failed/)
      ).toBeInTheDocument()
      await expect(canvas.getByText(issueTitle)).toBeVisible()
      await waitFor(() => expect(actions).toHaveAttribute("aria-busy", "false"))
    })
  },
})

export const DeleteFailure = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.delete("*/issues/:issueId", () =>
        HttpResponse.json(
          {
            error: {
              code: "internal_error",
              message: "Request failed.",
            },
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
      const actions = canvas.getByRole("button", {
        name: `Actions for ${issueTitle}`,
      })
      actions.focus()
      await waitFor(() => expect(actions).toHaveFocus())
      await userEvent.keyboard("{Enter}")
      const menu = await body.findByRole("menu", {
        name: `Actions for ${issueTitle}`,
      })
      await waitFor(() =>
        expect(
          within(menu).getByRole("menuitem", { name: "View details" })
        ).toHaveFocus()
      )
      await userEvent.keyboard("{End}")
      await waitFor(() =>
        expect(
          body.getByRole("menuitem", { name: "Delete issue" })
        ).toHaveFocus()
      )
      await userEvent.keyboard("{Enter}")
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
      await waitFor(() =>
        expect(
          body.queryByRole("alertdialog", { name: "Delete this issue?" })
        ).not.toBeInTheDocument()
      )
      await waitFor(
        () =>
          expect(
            ownerBody.querySelector("[data-base-ui-focus-guard]")
          ).not.toBeInTheDocument(),
        { timeout: 3_000 }
      )
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
