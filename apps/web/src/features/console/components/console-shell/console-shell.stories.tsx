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
let releaseReadySetActiveRequest: (() => void) | undefined
let readySetActiveRequests = 0
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
  beforeEach({ msw }) {
    readySetActiveRequests = 0
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
        readySetActiveRequests += 1
        await new Promise<void>((resolve) => {
          releaseReadySetActiveRequest = resolve
        })
        return HttpResponse.json(
          { message: "temporarily unavailable" },
          { status: 503 }
        )
      })
    )
    return () => {
      releaseReadySetActiveRequest?.()
      releaseReadySetActiveRequest = undefined
    }
  },
  play: async ({ canvas, canvasElement, step }) => {
    const expandedMetrics = new Map<
      Element,
      { width: number; height: number; borderRadius: string }
    >()

    await step("Toggle the responsive application navigation", async () => {
      await expect(
        canvas.getByRole("heading", { name: "Dashboard" })
      ).toBeVisible()
      const sidebar = canvasElement.querySelector<HTMLElement>(
        '[data-sidebar="sidebar"]'
      )
      const trigger = canvasElement.querySelector<HTMLButtonElement>(
        'button[data-sidebar="trigger"]'
      )
      if (!sidebar) throw new Error("Expanded sidebar was not rendered")
      await expect(trigger).toBeVisible()
      if (!trigger) throw new Error("Sidebar trigger was not rendered")

      const identities = sidebar.querySelectorAll<HTMLElement>(
        '[data-console-identity="brand"], [data-sidebar="menu-button"] [data-slot="avatar"]'
      )
      expect(identities.length).toBe(3)
      for (const identity of identities) {
        const rect = identity.getBoundingClientRect()
        expect(Math.abs(rect.width - 32)).toBeLessThanOrEqual(1)
        expect(Math.abs(rect.height - 32)).toBeLessThanOrEqual(1)
        expandedMetrics.set(identity, {
          width: rect.width,
          height: rect.height,
          borderRadius: getComputedStyle(identity).borderRadius,
        })
      }

      const icons = [
        ...sidebar.querySelectorAll<SVGElement>(
          '[data-sidebar="menu-button"] svg.lucide'
        ),
      ].filter((icon) => icon.getBoundingClientRect().width > 0)
      expect(icons.length).toBeGreaterThan(3)
      for (const icon of icons) {
        const rect = icon.getBoundingClientRect()
        expect(Math.abs(rect.width - 16)).toBeLessThanOrEqual(1)
        expect(Math.abs(rect.height - 16)).toBeLessThanOrEqual(1)
        expandedMetrics.set(icon, {
          width: rect.width,
          height: rect.height,
          borderRadius: getComputedStyle(icon).borderRadius,
        })
      }

      await userEvent.click(trigger)
      await expect(trigger).toHaveFocus()
    })

    await step(
      "Keep collapsed controls centered with inset identities",
      async () => {
        const sidebar = canvasElement.querySelector<HTMLElement>(
          '[data-sidebar="sidebar"]'
        )
        const sidebarContainer = canvasElement.querySelector<HTMLElement>(
          '[data-slot="sidebar-container"]'
        )
        const consoleFrame = canvasElement.querySelector<HTMLElement>(
          '[data-slot="sidebar-inset"]'
        )
        if (!sidebar) throw new Error("Collapsed sidebar was not rendered")
        if (!sidebarContainer)
          throw new Error("Sidebar container was not rendered")
        if (!consoleFrame) throw new Error("Console frame was not rendered")
        await waitFor(() =>
          expect(sidebar.closest("[data-state]")).toHaveAttribute(
            "data-state",
            "collapsed"
          )
        )
        await waitFor(() => {
          const visualRailCenter =
            (sidebarContainer.getBoundingClientRect().left +
              consoleFrame.getBoundingClientRect().left) /
            2
          const buttons = [
            ...sidebar.querySelectorAll<HTMLElement>(
              '[data-sidebar="menu-button"]'
            ),
          ].filter((button) => button.getBoundingClientRect().width > 0)
          expect(buttons.length).toBeGreaterThan(3)
          for (const button of buttons) {
            const rect = button.getBoundingClientRect()
            expect(Math.abs(rect.width - 32)).toBeLessThanOrEqual(1)
            expect(Math.abs(rect.height - 32)).toBeLessThanOrEqual(1)
            const centerOffset = Math.abs(
              rect.left + rect.width / 2 - visualRailCenter
            )
            if (centerOffset > 1) {
              throw new Error(
                `Collapsed control "${button.textContent?.trim()}" center offset ${centerOffset}; button left ${rect.left}; sidebar left ${sidebarContainer.getBoundingClientRect().left}; frame left ${consoleFrame.getBoundingClientRect().left}`
              )
            }
          }
        })

        const identities = sidebar.querySelectorAll<HTMLElement>(
          '[data-console-identity="brand"], [data-sidebar="menu-button"] [data-slot="avatar"]'
        )
        expect(identities.length).toBe(3)
        const organizationIdentity = sidebar.querySelector<HTMLElement>(
          '[data-sidebar="header"] [data-sidebar="menu-button"] [data-slot="avatar"]'
        )
        const organizationButton = organizationIdentity?.closest<HTMLElement>(
          '[data-sidebar="menu-button"]'
        )
        if (!organizationIdentity || !organizationButton)
          throw new Error(
            "Collapsed organization identity button was not rendered"
          )
        expect(getComputedStyle(organizationButton).borderRadius).toBe(
          getComputedStyle(organizationIdentity).borderRadius
        )
        const header = sidebar.querySelector<HTMLElement>(
          '[data-sidebar="header"]'
        )
        if (!header)
          throw new Error("Collapsed sidebar header was not rendered")
        const headerIdentities = [
          ...header.querySelectorAll<HTMLElement>(
            '[data-console-identity="brand"], [data-sidebar="menu-button"] [data-slot="avatar"]'
          ),
        ]
        expect(headerIdentities.length).toBe(2)
        const firstHeaderIdentityRect =
          headerIdentities[0]?.getBoundingClientRect()
        const secondHeaderIdentityRect =
          headerIdentities[1]?.getBoundingClientRect()
        if (!firstHeaderIdentityRect || !secondHeaderIdentityRect)
          throw new Error("Collapsed header identities were not rendered")
        expect(
          Math.abs(
            secondHeaderIdentityRect.top - firstHeaderIdentityRect.bottom - 8
          )
        ).toBeLessThanOrEqual(1)
        for (const identity of identities) {
          const identityRect = identity.getBoundingClientRect()
          const expanded = expandedMetrics.get(identity)
          const buttonRect = identity
            .closest<HTMLElement>('[data-sidebar="menu-button"]')
            ?.getBoundingClientRect()
          if (!expanded)
            throw new Error("Expanded identity metrics were not captured")
          if (!buttonRect) throw new Error("Identity button was not rendered")
          expect(Math.abs(identityRect.width - 32)).toBeLessThanOrEqual(1)
          expect(Math.abs(identityRect.height - 32)).toBeLessThanOrEqual(1)
          expect(
            Math.abs(identityRect.width - expanded.width)
          ).toBeLessThanOrEqual(1)
          expect(
            Math.abs(identityRect.height - expanded.height)
          ).toBeLessThanOrEqual(1)
          expect(getComputedStyle(identity).borderRadius).toBe(
            expanded.borderRadius
          )
          expect(
            Math.abs(identityRect.left - buttonRect.left)
          ).toBeLessThanOrEqual(1)
          expect(
            Math.abs(identityRect.top - buttonRect.top)
          ).toBeLessThanOrEqual(1)
        }

        const icons = [
          ...sidebar.querySelectorAll<SVGElement>(
            '[data-sidebar="menu-button"] svg.lucide'
          ),
        ].filter((icon) => icon.getBoundingClientRect().width > 0)
        expect(icons.length).toBeGreaterThan(3)
        for (const icon of icons) {
          const rect = icon.getBoundingClientRect()
          const expanded = expandedMetrics.get(icon)
          if (!expanded)
            throw new Error("Expanded icon metrics were not captured")
          expect(Math.abs(rect.width - 16)).toBeLessThanOrEqual(1)
          expect(Math.abs(rect.height - 16)).toBeLessThanOrEqual(1)
          expect(Math.abs(rect.width - expanded.width)).toBeLessThanOrEqual(1)
          expect(Math.abs(rect.height - expanded.height)).toBeLessThanOrEqual(1)
          expect(getComputedStyle(icon).borderRadius).toBe(
            expanded.borderRadius
          )
        }
      }
    )

    await step(
      "Traverse the inline account menu with the keyboard",
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
        const body = within(ownerBody)
        const accountMenu = await findVisibleMenu(ownerBody)
        await waitForVisible(
          await within(accountMenu).findByText("Accounts on this device")
        )
        await waitForVisible(
          await within(accountMenu).findByText("jordan@example.test")
        )
        const currentBadge = within(accountMenu).getByText("Current")
        const currentAccount =
          currentBadge.closest<HTMLElement>('[role="menuitem"]')
        if (!currentAccount)
          throw new Error("Current account menu item was not rendered")
        await expect(currentBadge).toBeVisible()
        await expect(
          within(currentAccount).getByLabelText("Current account")
        ).toBeVisible()
        await expect(currentAccount).toHaveAttribute("aria-current", "true")
        await expect(currentAccount).toHaveAttribute("aria-disabled", "true")
        expect(getComputedStyle(currentAccount).opacity).toBe("1")
        await expect(
          within(accountMenu).queryByText("Remove account from this device")
        ).not.toBeInTheDocument()
        await expect(
          within(accountMenu).queryByRole("menuitem", {
            name: /remove account/iu,
          })
        ).not.toBeInTheDocument()
        await expect(
          body.queryByRole("menu", { name: /remove account/iu })
        ).not.toBeInTheDocument()
        await expect(
          body.queryByRole("button", { name: /remove account/iu })
        ).not.toBeInTheDocument()
        await expect(
          body.queryByRole("dialog", { name: "Switch account" })
        ).not.toBeInTheDocument()
        const otherAccount = within(accountMenu).getByRole("menuitem", {
          name: /jordan@example\.test/u,
        })
        await expect(otherAccount).not.toHaveAttribute("aria-disabled", "true")
        otherAccount.focus()
        await expect(otherAccount).toHaveFocus()
        await userEvent.keyboard("{Enter}")
        await waitFor(() => expect(readySetActiveRequests).toBe(1))
        await userEvent.click(accountTrigger)
        const pendingMenu = await findVisibleMenu(ownerBody)
        await waitForVisible(
          within(pendingMenu).getByRole("status", {
            name: "Switching account",
          })
        )
        await expect(readySetActiveRequests).toBe(1)
        await userEvent.keyboard("{Escape}")
        await waitFor(() => expect(accountTrigger).toHaveFocus())
        await expect(
          body.queryByRole("alertdialog", {
            name: "Remove account from this device?",
          })
        ).not.toBeInTheDocument()
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
  play: async ({ canvasElement }) => {
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
    const accountMenu = await findVisibleMenu(ownerBody)
    const currentBadge = await waitForVisible(
      await within(accountMenu).findByText("Current")
    )
    const currentAccount =
      currentBadge.closest<HTMLElement>('[role="menuitem"]')
    if (!currentAccount)
      throw new Error("Current account menu item was not rendered")
    await waitForVisible(
      await within(currentAccount).findByLabelText("Current account")
    )
    await expect(currentAccount).toHaveAttribute("aria-current", "true")
    await expect(currentAccount).toHaveAttribute("aria-disabled", "true")
    await expect(
      within(accountMenu).queryByText("Remove account from this device")
    ).not.toBeInTheDocument()
    await expect(
      within(accountMenu).queryByRole("menuitem", {
        name: /remove account/iu,
      })
    ).not.toBeInTheDocument()
    await expect(
      body.queryByRole("menu", { name: /remove account/iu })
    ).not.toBeInTheDocument()
    await expect(
      body.queryByRole("button", { name: /remove account/iu })
    ).not.toBeInTheDocument()
    await expect(
      body.queryByRole("alertdialog", {
        name: "Remove account from this device?",
      })
    ).not.toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    await waitFor(() =>
      expect(
        body.getByRole("button", {
          name: /Avery Stone/u,
        })
      ).toHaveFocus()
    )
    await expect(trigger).toBeVisible()
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
  play: async ({ canvas, canvasElement }) => {
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
  play: async ({ canvas, canvasElement }) => {
    const ownerBody = canvasElement.ownerDocument.body
    const body = within(ownerBody)
    const accountTrigger = canvas.getByRole("button", {
      name: /Avery Stone/u,
    })
    const stableTrigger = canvasElement.querySelector<HTMLButtonElement>(
      'button[data-sidebar="trigger"]'
    )
    if (!stableTrigger)
      throw new Error("Stable sidebar trigger was not rendered")

    await userEvent.click(accountTrigger)
    let accountMenu = await findVisibleMenu(ownerBody)
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

    await userEvent.click(accountTrigger)
    accountMenu = await findVisibleMenu(ownerBody)
    await userEvent.click(
      await within(accountMenu).findByText("jordan@example.test")
    )
    const confirmSwitchDialog = await findVisibleAlertDialog(
      ownerBody,
      "Discard local Agent work and switch account?"
    )
    await userEvent.dblClick(
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

    await userEvent.click(accountTrigger)
    const menu = await findVisibleMenu(ownerBody)
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Sign out" })
    )
    const signOutDialog = await findVisibleAlertDialog(
      ownerBody,
      "Discard local Agent work and sign out?"
    )
    await userEvent.click(
      within(signOutDialog).getByRole("button", {
        name: "Discard local draft and sign out",
      })
    )
    await waitFor(() => expect(sessionMutationRequests).toBe(2))
    await expect(agentRevokeRequests).toBe(2)
    await waitFor(() =>
      expect(
        body
          .getAllByText("Could not sign out. Try again.")
          .some((element) => element.getBoundingClientRect().width > 0)
      ).toBe(true)
    )
    await expect(canvas.getByText("Unsaved Issue draft")).toBeVisible()
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
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(
      canvas.getByRole("button", {
        name: /Avery Stone/u,
      })
    )
    const menu = await findVisibleMenu(canvasElement.ownerDocument.body)
    await waitFor(() =>
      expect(within(menu).getByText("Loading accounts")).toBeVisible()
    )
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
  play: async ({ canvas, canvasElement }) => {
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
  play: async ({ canvas, canvasElement }) => {
    const accountTrigger = canvas.getByRole("button", {
      name: /Avery Stone/u,
    })
    await userEvent.click(accountTrigger)
    const ownerBody = canvasElement.ownerDocument.body
    const menu = await findVisibleMenu(ownerBody)
    await userEvent.click(await within(menu).findByText("jordan@example.test"))
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
  },
})
