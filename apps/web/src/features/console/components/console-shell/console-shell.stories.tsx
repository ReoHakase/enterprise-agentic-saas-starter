import { http, HttpResponse } from "msw"
import { useMemo } from "react"
import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"
import { Providers } from "@/components/providers/providers"
import { fictionalMe } from "@/features/account/test-support/fixtures"
import { useRegisterAgentForm } from "@/features/agent"

import { createDeferred } from "../../../../test-support/storybook/deferred"
import { ConsoleShell } from "./console-shell"

const deviceAccountsResponse = [
  {
    session: { token: "session_current_story" },
    user: {
      id: fictionalMe.user.id,
      name: fictionalMe.user.name,
      email: fictionalMe.user.email,
      image: fictionalMe.user.profileImage,
    },
  },
  {
    session: { token: "session_jordan_story" },
    user: {
      id: "user_01K1JORDAN0000000000000",
      name: "Jordan Lee",
      email: "jordan@example.test",
      image: null,
    },
  },
]

const currentSessionResponse = {
  session: { token: "session_current_story" },
  user: { id: fictionalMe.user.id },
}

const secondaryOrganization = {
  id: "org_01K1SECONDARY000000000",
  name: "Secondary Workspace",
  slug: "secondary",
  role: "owner" as const,
  active: false,
  profileImage: null,
  memberCount: 3,
  memberProfileImages: [],
  permissions: {
    canEditOrganization: true,
    canInviteMembers: true,
    canManageMembers: true,
    canManageAdmins: true,
    canTransferOwnership: true,
  },
}

let agentRevokeRequests = 0
let releasePendingOrganizationRequest: (() => void) | undefined
let sessionMutationRequests = 0

const DirtyIssueDraft = () => {
  const organizationId =
    fictionalMe.activeOrganizationId ?? fictionalMe.organizations[0]?.id
  const adapter = useMemo(
    () =>
      organizationId
        ? {
            formId: "storybook-dirty-issue",
            organizationId,
            resource: "issue" as const,
            revision: 1,
            epoch: "storybook-epoch",
            read: () => ({
              values: { title: "Unsaved title" },
              dirtyFields: ["title" as const],
            }),
            validate: () => ({ success: true as const, patch: {} }),
            apply: () => undefined,
          }
        : null,
    [organizationId]
  )
  useRegisterAgentForm(adapter)
  return (
    <section aria-labelledby="dirty-story-heading">
      <h1 id="dirty-story-heading">Dashboard</h1>
      <p>Unsaved Issue draft</p>
    </section>
  )
}

const waitForVisible = async <TElement extends HTMLElement>(
  element: TElement
) => {
  await waitFor(() => expect(element).toBeVisible())
  return element
}

const findVisibleMenu = async (ownerBody: HTMLElement) => {
  let visibleMenu: HTMLElement | undefined
  await waitFor(() => {
    const menus = within(ownerBody).queryAllByRole("menu")
    visibleMenu = menus.find((menu) => menu.hasAttribute("data-open"))
    expect(visibleMenu).toBeDefined()
    expect(visibleMenu).toBeVisible()
  })
  if (!visibleMenu) throw new Error("Visible account menu was not rendered")
  return visibleMenu
}

const findVisibleAlertDialog = async (ownerBody: HTMLElement, name: string) =>
  waitForVisible(await within(ownerBody).findByRole("alertdialog", { name }))

const meta = preview.meta({
  title: "Web/Console/Console Shell",
  component: ConsoleShell,
  tags: ["autodocs"],
  parameters: { disableGlobalToaster: true, layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="-m-6">
        <Providers>
          <Story />
        </Providers>
      </div>
    ),
  ],
  args: {
    me: fictionalMe,
    children: (
      <section aria-labelledby="story-dashboard-heading">
        <h1 id="story-dashboard-heading">Dashboard</h1>
        <p>Review tenant activity and open work.</p>
      </section>
    ),
  },
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
})

export const AccountMenuKeyboard = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.get("*/auth/multi-session/list-device-sessions", () =>
        HttpResponse.json(deviceAccountsResponse)
      ),
      http.get("*/auth/get-session", () =>
        HttpResponse.json(currentSessionResponse)
      )
    )
  },
  play: async ({ canvas, canvasElement, step }) => {
    await step(
      "キーボードを使用してインライン アカウント メニューを移動する",
      async () => {
        const accountTrigger = canvas.getByRole("button", {
          name: /Avery Stone/u,
        })
        const stableTrigger = canvasElement.querySelector<HTMLButtonElement>(
          'button[data-sidebar="trigger"]'
        )
        if (!stableTrigger)
          throw new Error("Stable sidebar trigger was not rendered")
        stableTrigger.focus()
        await userEvent.tab({ shift: true })
        await expect(accountTrigger).toHaveFocus()
        await userEvent.keyboard("{Enter}")
        const ownerBody = canvasElement.ownerDocument.body
        await findVisibleMenu(ownerBody)
        await userEvent.keyboard("{Escape}")
        await waitFor(() => expect(accountTrigger).toHaveFocus())
      }
    )
  },
})

export const Mobile = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  beforeEach({ msw }) {
    msw.use(
      http.get("*/auth/multi-session/list-device-sessions", () =>
        HttpResponse.json(deviceAccountsResponse)
      ),
      http.get("*/auth/get-session", () =>
        HttpResponse.json(currentSessionResponse)
      )
    )
  },
  play: async ({ canvasElement, step }) => {
    await step(
      "モバイルでアカウントメニューを閉じてフォーカスを戻す",
      async () => {
        const trigger = canvasElement.querySelector<HTMLButtonElement>(
          'button[data-sidebar="trigger"]'
        )
        await expect(trigger).toBeVisible()
        if (!trigger) throw new Error("Sidebar trigger was not rendered")
        await userEvent.click(trigger)
        const ownerBody = canvasElement.ownerDocument.body
        const body = within(ownerBody)
        await userEvent.click(
          await body.findByRole("button", { name: /Avery Stone/u })
        )
        await findVisibleMenu(ownerBody)
        await userEvent.keyboard("{Escape}")
        await waitFor(() =>
          expect(
            body.getByRole("button", {
              name: /Avery Stone/u,
            })
          ).toHaveFocus()
        )
        await expect(trigger).toBeVisible()
      }
    )
  },
})

export const OrganizationPendingShape = meta.story({
  tags: ["theme-sensitive"],
  args: {
    me: {
      ...fictionalMe,
      organizations: [...fictionalMe.organizations, secondaryOrganization],
    },
  },
  beforeEach({ msw }) {
    msw.use(
      http.post("*/organizations/:organizationId/activate", async () => {
        await new Promise<void>((resolve) => {
          releasePendingOrganizationRequest = resolve
        })
        return HttpResponse.json(
          {
            error: "service_unavailable",
            message: "The service is temporarily unavailable.",
          },
          { status: 503 }
        )
      })
    )
    return () => {
      releasePendingOrganizationRequest?.()
      releasePendingOrganizationRequest = undefined
    }
  },
  play: async ({ canvas, canvasElement, step }) => {
    await step("組織切替中の識別表示をサイドバーの状態に合わせる", async () => {
      const sidebar = canvasElement.querySelector<HTMLElement>(
        '[data-sidebar="sidebar"]'
      )
      const sidebarTrigger = canvasElement.querySelector<HTMLButtonElement>(
        'button[data-sidebar="trigger"]'
      )
      if (!sidebar) throw new Error("Expanded sidebar was not rendered")
      if (!sidebarTrigger) throw new Error("Sidebar trigger was not rendered")
      const roundedXlIdentity = sidebar.querySelector<HTMLElement>(
        '[data-console-identity="brand"]'
      )
      if (!roundedXlIdentity)
        throw new Error("Expanded rounded identity was not rendered")
      const expandedRoundedXlRadius =
        getComputedStyle(roundedXlIdentity).borderRadius

      const getOrganizationTrigger = () =>
        canvas.getByRole("button", {
          name: /Acme Cloud/u,
        })
      getOrganizationTrigger().click()
      const body = within(canvasElement.ownerDocument.body)
      const secondaryOrganizationItem = await body.findByRole("menuitem", {
        name: /Secondary Workspace/u,
      })
      await waitFor(() => expect(secondaryOrganizationItem).toBeVisible())
      await userEvent.click(secondaryOrganizationItem)

      const pendingIdentity = await waitForVisible(
        await within(sidebar).findByRole("status")
      )
      const pendingTile = pendingIdentity.closest<HTMLElement>(
        '[data-console-identity="organization"]'
      )
      if (!pendingTile)
        throw new Error("Pending organization identity was not rendered")
      expect(getComputedStyle(pendingTile).borderRadius).toBe(
        expandedRoundedXlRadius
      )

      await userEvent.click(sidebarTrigger)
      await waitFor(() =>
        expect(sidebar.closest("[data-state]")).toHaveAttribute(
          "data-state",
          "collapsed"
        )
      )
      const pendingRect = pendingTile.getBoundingClientRect()
      expect(Math.abs(pendingRect.width - 32)).toBeLessThanOrEqual(1)
      expect(Math.abs(pendingRect.height - 32)).toBeLessThanOrEqual(1)
      const organizationButton = pendingTile.closest<HTMLElement>(
        '[data-sidebar="menu-button"]'
      )
      if (!organizationButton)
        throw new Error("Pending organization trigger was not rendered")
      expect(getComputedStyle(organizationButton).borderRadius).toBe(
        getComputedStyle(pendingTile).borderRadius
      )
    })
  },
})

export const DirtyAccountActionsFailSafely = meta.story({
  args: { children: <DirtyIssueDraft /> },
  beforeEach({ msw }) {
    agentRevokeRequests = 0
    sessionMutationRequests = 0
    msw.use(
      http.get("*/auth/get-session", () =>
        HttpResponse.json(currentSessionResponse)
      ),
      http.get("*/auth/multi-session/list-device-sessions", () =>
        HttpResponse.json(deviceAccountsResponse)
      ),
      http.post("*/agent/context/revoke", () => {
        agentRevokeRequests += 1
        return HttpResponse.json({ contextEpoch: 2 })
      }),
      http.post("*/auth/multi-session/set-active", () => {
        sessionMutationRequests += 1
        return HttpResponse.json({}, { status: 503 })
      }),
      http.post("*/auth/multi-session/revoke", () => {
        sessionMutationRequests += 1
        return HttpResponse.json({}, { status: 503 })
      })
    )
  },
  play: async ({ canvas, canvasElement, step }) => {
    const ownerBody = canvasElement.ownerDocument.body
    const accountTrigger = canvas.getByRole("button", {
      name: /Avery Stone/u,
    })
    const stableTrigger = canvasElement.querySelector<HTMLButtonElement>(
      'button[data-sidebar="trigger"]'
    )
    if (!stableTrigger)
      throw new Error("Stable sidebar trigger was not rendered")

    await step("アカウント切替を取り消すとローカル作業を維持する", async () => {
      await userEvent.click(accountTrigger)
      const accountMenu = await findVisibleMenu(ownerBody)
      await userEvent.click(
        await within(accountMenu).findByText("jordan@example.test")
      )
      const switchDialog = await findVisibleAlertDialog(
        ownerBody,
        "Discard local Agent work and switch account?"
      )
      await expect(sessionMutationRequests).toBe(0)
      await expect(agentRevokeRequests).toBe(0)
      await userEvent.click(
        within(switchDialog).getByRole("button", { name: "Stay here" })
      )
      await waitFor(() => expect(stableTrigger).toHaveFocus())
      await expect(sessionMutationRequests).toBe(0)
      await expect(agentRevokeRequests).toBe(0)
    })
  },
})

export const DirtyAccountSwitchFailure = meta.story({
  args: { children: <DirtyIssueDraft /> },
  beforeEach({ msw }) {
    agentRevokeRequests = 0
    sessionMutationRequests = 0
    msw.use(
      http.get("*/auth/get-session", () =>
        HttpResponse.json(currentSessionResponse)
      ),
      http.get("*/auth/multi-session/list-device-sessions", () =>
        HttpResponse.json(deviceAccountsResponse)
      ),
      http.post("*/agent/context/revoke", () => {
        agentRevokeRequests += 1
        return HttpResponse.json({ contextEpoch: 2 })
      }),
      http.post("*/auth/multi-session/set-active", () => {
        sessionMutationRequests += 1
        return HttpResponse.json({}, { status: 503 })
      }),
      http.post("*/auth/multi-session/revoke", () => {
        sessionMutationRequests += 1
        return HttpResponse.json({}, { status: 503 })
      })
    )
  },
  play: async ({ canvas, canvasElement, step }) => {
    const ownerBody = canvasElement.ownerDocument.body
    const body = within(ownerBody)
    const accountTrigger = canvas.getByRole("button", {
      name: /Avery Stone/u,
    })
    await step(
      "アカウント切替に失敗すると現在の画面と下書きを維持する",
      async () => {
        await userEvent.click(accountTrigger)
        const accountMenu = await findVisibleMenu(ownerBody)
        await userEvent.click(
          await within(accountMenu).findByText("jordan@example.test")
        )
        const confirmSwitchDialog = await findVisibleAlertDialog(
          ownerBody,
          "Discard local Agent work and switch account?"
        )
        await userEvent.click(
          within(confirmSwitchDialog).getByRole("button", {
            name: "Discard local draft and switch",
          })
        )
        await waitFor(() => expect(sessionMutationRequests).toBe(1))
        await expect(agentRevokeRequests).toBe(1)
        await waitFor(() =>
          expect(
            body
              .getAllByText("Could not switch account. Try again.")
              .some((element) => element.getBoundingClientRect().width > 0)
          ).toBe(true)
        )
        await expect(canvas.getByText("Unsaved Issue draft")).toBeVisible()
        await expect(canvas.getByText("Dashboard")).toBeVisible()
      }
    )
  },
})

export const DirtySignOutFailure = meta.story({
  args: { children: <DirtyIssueDraft /> },
  beforeEach({ msw }) {
    agentRevokeRequests = 0
    sessionMutationRequests = 0
    msw.use(
      http.get("*/auth/get-session", () =>
        HttpResponse.json(currentSessionResponse)
      ),
      http.get("*/auth/multi-session/list-device-sessions", () =>
        HttpResponse.json(deviceAccountsResponse)
      ),
      http.post("*/agent/context/revoke", () => {
        agentRevokeRequests += 1
        return HttpResponse.json({ contextEpoch: 2 })
      }),
      http.post("*/auth/multi-session/set-active", () => {
        sessionMutationRequests += 1
        return HttpResponse.json({}, { status: 503 })
      }),
      http.post("*/auth/multi-session/revoke", () => {
        sessionMutationRequests += 1
        return HttpResponse.json({}, { status: 503 })
      })
    )
  },
  play: async ({ canvas, canvasElement, step }) => {
    const ownerBody = canvasElement.ownerDocument.body
    const body = within(ownerBody)
    const accountTrigger = canvas.getByRole("button", {
      name: /Avery Stone/u,
    })
    await step("サインアウトに失敗すると下書きを維持する", async () => {
      await userEvent.click(accountTrigger)
      const menu = await findVisibleMenu(ownerBody)
      await waitForVisible(
        await within(menu).findByLabelText("Current account")
      )
      const signOut = within(menu).getByRole("menuitem", { name: "Sign out" })
      await userEvent.click(signOut)
      const signOutDialog = await findVisibleAlertDialog(
        ownerBody,
        "Discard local Agent work and sign out?"
      )
      await userEvent.click(
        within(signOutDialog).getByRole("button", {
          name: "Discard local draft and sign out",
        })
      )
      await waitFor(() => expect(sessionMutationRequests).toBe(1))
      await expect(agentRevokeRequests).toBe(1)
      await waitFor(() =>
        expect(
          body
            .getAllByText("Could not sign out. Try again.")
            .some((element) => element.getBoundingClientRect().width > 0)
        ).toBe(true)
      )
      await expect(canvas.getByText("Unsaved Issue draft")).toBeVisible()
    })
  },
})

export const AccountsLoading = meta.story({
  beforeEach({ msw }) {
    const responseGate = createDeferred<void>()
    msw.use(
      http.get("*/auth/multi-session/list-device-sessions", async () => {
        await responseGate.promise
        return HttpResponse.json([])
      })
    )
    return () => responseGate.resolve(undefined)
  },
  play: async ({ canvas, canvasElement, step }) => {
    await step("アカウントメニューを開くと取得中の状態を表示する", async () => {
      await userEvent.click(
        canvas.getByRole("button", {
          name: /Avery Stone/u,
        })
      )
      const menu = await findVisibleMenu(canvasElement.ownerDocument.body)
      await waitFor(() =>
        expect(within(menu).getByText("Loading accounts")).toBeVisible()
      )
    })
  },
})

export const AccountsError = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.get("*/auth/multi-session/list-device-sessions", () =>
        HttpResponse.json({ message: "private detail" }, { status: 503 })
      )
    )
  },
  play: async ({ canvas, canvasElement, step }) => {
    await step(
      "アカウントメニューを開くと安全な読み込みエラーを表示する",
      async () => {
        await userEvent.click(
          canvas.getByRole("button", {
            name: /Avery Stone/u,
          })
        )
        const body = within(canvasElement.ownerDocument.body)
        const menu = await findVisibleMenu(canvasElement.ownerDocument.body)
        await waitForVisible(
          await within(menu).findByText("Try loading accounts again")
        )
        await expect(body.queryByText("private detail")).not.toBeInTheDocument()
      }
    )
  },
})

export const AccountsPending = meta.story({
  beforeEach({ msw }) {
    const responseGate = createDeferred<void>()
    msw.use(
      http.get("*/auth/multi-session/list-device-sessions", () =>
        HttpResponse.json(deviceAccountsResponse)
      ),
      http.get("*/auth/get-session", () =>
        HttpResponse.json(currentSessionResponse)
      ),
      http.post("*/agent/context/revoke", () =>
        HttpResponse.json({ contextEpoch: 2 })
      ),
      http.post("*/auth/multi-session/set-active", async () => {
        await responseGate.promise
        return HttpResponse.json({}, { status: 503 })
      })
    )
    return () => responseGate.resolve(undefined)
  },
  play: async ({ canvas, canvasElement, step }) => {
    await step("アカウント切替中はサインアウトを無効にする", async () => {
      const accountTrigger = canvas.getByRole("button", {
        name: /Avery Stone/u,
      })
      await userEvent.click(accountTrigger)
      const ownerBody = canvasElement.ownerDocument.body
      const menu = await findVisibleMenu(ownerBody)
      await userEvent.click(
        await within(menu).findByText("jordan@example.test")
      )
      await userEvent.click(accountTrigger)
      const pendingMenu = await findVisibleMenu(ownerBody)
      await waitForVisible(
        within(pendingMenu).getByRole("status", {
          name: "Switching account",
        })
      )
      await expect(
        within(pendingMenu).getByRole("menuitem", {
          name: /Sign out/u,
        })
      ).toHaveAttribute("aria-disabled", "true")
    })
  },
})
