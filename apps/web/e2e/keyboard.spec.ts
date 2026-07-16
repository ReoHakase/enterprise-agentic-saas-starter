import type { BrowserContext, Locator, Page } from "@playwright/test"

import { expect, test } from "./fixtures/test"
import { activate, replaceText, tabTo } from "./helpers/keyboard"

const mockApiUrl = "http://127.0.0.1:3001"

const resetMockApi = async () => {
  const response = await fetch(`${mockApiUrl}/__e2e/reset`, { method: "POST" })
  expect(response.ok).toBeTruthy()
}

const useSession = async (
  context: BrowserContext,
  session: "admin" | "new-user"
) => {
  await context.addCookies([
    {
      name: "e2e-session",
      value: session,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ])
}

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768

const keyboardSidebarLink = async (page: Page, name: string) => {
  let link: Locator
  if (isMobile(page)) {
    await activate(page, page.getByRole("button", { name: "Toggle Sidebar" }))
    const sidebar = page.getByRole("dialog", { name: "Sidebar" })
    await expect(sidebar).toBeVisible()
    link = sidebar.getByRole("link", { name, exact: true })
  } else {
    link = page.getByRole("link", { name, exact: true })
  }

  await activate(page, link)
}

const keyboardOrganizationSwitcher = async (page: Page) => {
  if (isMobile(page)) {
    await activate(page, page.getByRole("button", { name: "Toggle Sidebar" }))
    await expect(page.getByRole("dialog", { name: "Sidebar" })).toBeVisible()
  }

  const trigger = page
    .locator('[data-slot="dropdown-menu-trigger"][data-sidebar="menu-button"]')
    .filter({ hasText: "Alpha Operations" })
  await activate(page, trigger)
}

test.beforeEach(async () => {
  await resetMockApi()
})

test("キーボードだけでmagic link登録・組織作成・dashboard到達を完了できる", async ({
  context,
  page,
}) => {
  await page.goto("/auth/sign-in")

  const email = page.getByRole("textbox", { name: "Email" })
  await replaceText(page, email, "keyboard-new@example.com")
  const magicLinkResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/auth/sign-in/magic-link") &&
      response.request().method() === "POST"
  )
  await activate(page, page.getByRole("button", { name: /send magic link/i }))
  expect((await magicLinkResponse).ok()).toBeTruthy()
  await expect(page.getByRole("status")).toContainText(
    "keyboard-new@example.com"
  )

  // Opening the delivered one-time link is modeled by the resulting session;
  // all in-app user actions remain keyboard-only.
  await useSession(context, "new-user")
  await page.goto("/settings/organizations")
  await activate(
    page,
    page.getByRole("button", { name: "Create organization" })
  )
  const dialog = page.getByRole("dialog", { name: "Create organization" })
  await replaceText(page, dialog.getByLabel("Name"), "Keyboard Operations")
  await expect(dialog.getByLabel("Slug")).toHaveValue("keyboard-operations")
  await activate(
    page,
    dialog.getByRole("button", { name: "Create organization" })
  )
  await expect(page.getByText("Keyboard Operations").first()).toBeVisible()
  await page.keyboard.press("Escape")

  await keyboardSidebarLink(page, "Overview")
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(
    page.getByRole("heading", { name: "Overview", level: 1 })
  ).toBeVisible()
})

test("キーボード更新中もIssueのfocusを保持し、内部scrollとtenant切替を扱える", async ({
  context,
  page,
}) => {
  await useSession(context, "admin")
  await page.goto("/dashboard/todos")
  await expect(
    page.getByRole("heading", { name: "Issues", level: 1 })
  ).toBeVisible()

  const tableContainer = page.locator('[data-slot="table-container"]').first()
  const overflow = await tableContainer.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }))
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth)
  if (isMobile(page)) {
    expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth)
    await expect(
      page.getByRole("region", { name: "Organization issues" })
    ).toHaveAttribute("tabindex", "0")
  }

  await activate(page, page.getByRole("button", { name: "New issue" }))
  const createDialog = page.getByRole("dialog", { name: "Create issue" })
  await replaceText(
    page,
    createDialog.getByLabel("Title"),
    "Document keyboard-only operations"
  )
  await activate(
    page,
    createDialog.getByRole("button", { name: "Create issue" })
  )
  await expect(
    page.getByText("Document keyboard-only operations").first()
  ).toBeVisible()

  const delayResponse = await context.request.post(
    `${mockApiUrl}/__e2e/request-delays`,
    { data: { path: "/todos/issue-a-2", method: "PATCH", delayMs: 1_200 } }
  )
  expect(delayResponse.status()).toBe(201)
  const priority = page.getByRole("combobox", {
    name: "Priority for Triage keyboard regression",
  })
  await tabTo(page, priority)
  await page.keyboard.press("Enter")
  await expect(page.getByRole("option", { name: "Low" })).toBeVisible()
  const updateResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/todos/issue-a-2") &&
      response.request().method() === "PATCH"
  )
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")

  await expect(priority).toHaveAttribute("aria-busy", "true")
  await expect(priority).toBeFocused()
  expect((await updateResponse).ok()).toBeTruthy()
  await expect(priority).toContainText("medium")
  await expect(priority).toHaveAttribute("aria-busy", "false")
  await expect(priority).toBeFocused()
  await expect(
    page.locator("tbody tr").first().getByText("Triage keyboard regression")
  ).toBeVisible()

  await keyboardOrganizationSwitcher(page)
  const switchResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/organizations/org-b/activate") &&
      response.request().method() === "POST"
  )
  const betaOrganization = page.getByRole("menuitem", {
    name: "Beta Support",
  })
  await expect(betaOrganization).toBeVisible()
  await page.keyboard.press("ArrowDown")
  await expect(betaOrganization).toBeFocused()
  await page.keyboard.press("Enter")
  expect((await switchResponse).ok()).toBeTruthy()
  await expect(page.getByText("Organization switched")).toBeVisible()
  await expect(page.getByText("Private Beta issue")).toBeVisible()
  await expect(page.getByText("Triage keyboard regression")).toHaveCount(0)
})

test("キーボードだけでmember管理・session revoke・passkey再認証を完了できる", async ({
  allowClientErrors,
  context,
  page,
}) => {
  allowClientErrors(/Failed to load resource.*403/)
  await useSession(context, "admin")
  const delayResponse = await context.request.post(
    `${mockApiUrl}/__e2e/request-delays`,
    {
      data: {
        path: "/organizations/org-a/members/member-kai",
        method: "PATCH",
        delayMs: 800,
      },
    }
  )
  expect(delayResponse.status()).toBe(201)
  await page.goto("/organization/org-a/members")

  const role = page.getByRole("combobox", { name: "Role for Kai Brooks" })
  await tabTo(page, role)
  await page.keyboard.press("Enter")
  const roleResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/organizations/org-a/members/member-kai") &&
      response.request().method() === "PATCH"
  )
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")
  await expect(role).toHaveAttribute("aria-busy", "true")
  await expect(role).toBeFocused()
  expect((await roleResponse).ok()).toBeTruthy()
  await expect(role).toContainText("Admin")
  await expect(role).toBeFocused()

  await activate(page, page.getByRole("button", { name: "Remove Kai Brooks" }))
  const removeDialog = page.getByRole("alertdialog", {
    name: "Remove Kai Brooks?",
  })
  await replaceText(
    page,
    removeDialog.getByRole("textbox", { name: "Member email" }),
    "kai@example.com"
  )
  const removeResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/organizations/org-a/members/member-kai") &&
      response.request().method() === "DELETE"
  )
  await activate(
    page,
    removeDialog.getByRole("button", { name: "Remove member" })
  )
  expect((await removeResponse).ok()).toBeTruthy()
  await expect(page.getByText("Member removed")).toBeVisible()

  await activate(page, page.getByRole("button", { name: "Invite members" }))
  const inviteDialog = page.getByRole("dialog", { name: "Invite members" })
  await replaceText(
    page,
    inviteDialog.getByRole("textbox", { name: "Email addresses" }),
    "keyboard-member@example.com"
  )
  const inviteResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/organizations/org-a/invitations") &&
      response.request().method() === "POST"
  )
  await activate(
    page,
    inviteDialog.getByRole("button", { name: "Send invitations" })
  )
  expect((await inviteResponse).status()).toBe(201)
  await expect(
    page.getByText("keyboard-member@example.com", { exact: true })
  ).toBeVisible()

  await keyboardSidebarLink(page, "Account")
  await expect(page).toHaveURL(/\/settings\/account$/)
  await activate(
    page,
    page.getByRole("button", { name: "Revoke", exact: true })
  )
  const revokeDialog = page.getByRole("alertdialog", {
    name: "Revoke this session?",
  })
  const revokeResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/me/sessions/session-admin-other") &&
      response.request().method() === "DELETE"
  )
  await activate(
    page,
    revokeDialog.getByRole("button", { name: "Revoke session" })
  )
  expect((await revokeResponse).ok()).toBeTruthy()
  await expect(page.getByText("iPhone (Safari)")).toHaveCount(0)

  const addPasskey = page.getByRole("button", { name: "Add passkey" })
  await activate(page, addPasskey)
  const stepUp = page.getByRole("alertdialog", {
    name: "Sign in again to add a passkey",
  })
  await expect(stepUp).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(addPasskey).toBeFocused()
  await page.keyboard.press("Enter")
  await activate(
    page,
    stepUp.getByRole("button", { name: "Continue to sign in" })
  )
  await expect(page).toHaveURL(
    "/auth/sign-in?reauth=1&action=account.passkey.add&redirectTo=/settings/account"
  )
})

test("キーボードだけでorganizationの二重確認削除を完了できる", async ({
  context,
  page,
}) => {
  await useSession(context, "admin")
  await page.goto("/organization/org-a/settings")
  await activate(
    page,
    page.getByRole("button", { name: "Delete organization" })
  )
  const dialog = page.getByRole("alertdialog", {
    name: "Delete Alpha Operations?",
  })
  await replaceText(
    page,
    dialog.getByLabel("Type the organization slug"),
    "alpha-operations"
  )
  await replaceText(page, dialog.getByLabel("Type DELETE to confirm"), "DELETE")
  const deleteResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/organizations/org-a") &&
      response.request().method() === "DELETE"
  )
  await activate(
    page,
    dialog.getByRole("button", { name: "Permanently delete" })
  )
  expect((await deleteResponse).ok()).toBeTruthy()
  await expect(page).toHaveURL(/\/settings\/organizations$/)
  await expect(page.getByText("Organization deleted")).toBeVisible()
})
