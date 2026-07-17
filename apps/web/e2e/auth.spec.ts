import type { BrowserContext, Page } from "@playwright/test"

import { expect, test } from "./fixtures/test"

const mockApiUrl = "http://127.0.0.1:3001"
const publicInvitationId = "invitation-new-user"
const publicInvitationPath = `/invitations/${publicInvitationId}` as const

const resetMockApi = async () => {
  const response = await fetch(`${mockApiUrl}/__e2e/reset`, { method: "POST" })
  expect(response.ok).toBeTruthy()
}

const useSession = async (
  context: BrowserContext,
  session: "admin" | "new-user" | "unselected"
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

const openMobileSidebar = async (page: Page) => {
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await page.getByRole("button", { name: "Toggle Sidebar" }).click()
    await expect(page.getByRole("dialog", { name: "Sidebar" })).toBeVisible()
  }
}

const openOrganizationSwitcher = async (page: Page) => {
  await openMobileSidebar(page)

  await page
    .locator('[data-slot="dropdown-menu-trigger"][data-sidebar="menu-button"]')
    .filter({
      hasText:
        /alpha operations|beta support|invitation operations|choose organization/i,
    })
    .click()
}

test.beforeEach(async () => {
  await resetMockApi()
})

test("旧招待URLを維持しつつinvitations slugのtenant routeを解決する", async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chrome",
    "namespace compatibilityはdesktopでrouting integrationを一度検証する"
  )

  const legacyPath =
    `/organization/invitations/${publicInvitationId}?source=legacy` as const
  const legacyResponse = await context.request.get(
    `http://127.0.0.1:3000${legacyPath}`,
    { maxRedirects: 0 }
  )
  expect(legacyResponse.status()).toBe(307)
  expect(legacyResponse.headers().location).toBe(
    `${publicInvitationPath}?source=legacy`
  )

  await page.goto(legacyPath)
  await expect(page).toHaveURL(
    `http://127.0.0.1:3000${publicInvitationPath}?source=legacy`
  )
  await expect(
    page.getByRole("heading", { name: "You're invited" })
  ).toBeVisible()

  await useSession(context, "admin")
  await page.goto("/organization/invitations/members")
  await expect(page).toHaveURL(/\/organization\/invitations\/members$/)
  await expect(
    page.getByRole("region", { name: "Switch to Invitation Operations" })
  ).toBeVisible()
})

test("未ログインの招待対象者が新規登録後の戻り先を失わない", async ({
  context,
  page,
}) => {
  await page.goto(publicInvitationPath)

  await expect(
    page.getByRole("heading", { name: "You're invited" })
  ).toBeVisible()
  const createAccount = page.getByRole("link", { name: "Create account" })
  await expect(createAccount).toHaveAttribute(
    "href",
    `/auth/sign-up?redirectTo=${encodeURIComponent(publicInvitationPath)}`
  )
  await createAccount.click()

  await expect(page).toHaveURL(/\/auth\/sign-up\?redirectTo=/)
  const authUrl = new URL(page.url())
  expect(authUrl.pathname).toBe("/auth/sign-up")
  expect(authUrl.searchParams.get("redirectTo")).toBe(publicInvitationPath)
  await expect(page.getByText("Create account", { exact: true })).toBeVisible()

  const email = page.getByRole("textbox", { name: "Email" })
  await expect(email).toBeEnabled()
  await email.fill("new-user@example.com")
  const magicLinkResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/auth/sign-in/magic-link") &&
      response.request().method() === "POST"
  )
  await page.getByRole("button", { name: /send magic link/i }).click()
  const response = await magicLinkResponse
  expect(response.ok()).toBeTruthy()
  expect(response.request().postDataJSON()).toEqual(
    expect.objectContaining({
      callbackURL: `http://127.0.0.1:3000${publicInvitationPath}`,
      email: "new-user@example.com",
    })
  )

  // Email delivery is covered at the package boundary. Installing the session
  // models opening the one-time link after this first account is created.
  await useSession(context, "new-user")
  await page.goto(publicInvitationPath)
  await expect(
    page.getByRole("heading", { name: "Join Alpha Operations" })
  ).toBeVisible()

  const acceptResponse = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith("/auth/organization/accept-invitation") &&
      candidate.request().method() === "POST"
  )
  await page.getByRole("button", { name: "Accept invitation" }).click()
  expect((await acceptResponse).ok()).toBeTruthy()
  await expect(page.getByText("Invitation accepted")).toBeVisible()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByText("Alpha Operations").first()).toBeVisible()

  const membersResponse = await context.request.get(
    `${mockApiUrl}/organizations/org-a/members`
  )
  expect(membersResponse.ok()).toBeTruthy()
  expect(await membersResponse.json()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        email: "new-user@example.com",
        role: "member",
      }),
    ])
  )
})

test("別accountで開いた招待から対象accountへ切り替えて参加できる", async ({
  context,
  page,
}) => {
  await useSession(context, "admin")
  await page.goto(publicInvitationPath)

  await expect(
    page.getByRole("heading", { name: "Use the invited account" })
  ).toBeVisible()
  await expect(
    page.getByText("admin@example.com", { exact: true })
  ).toBeVisible()
  const addAccount = page.getByRole("link", { name: "Add account" })
  await expect(addAccount).toHaveAttribute(
    "href",
    `/auth/sign-in?redirectTo=${encodeURIComponent(publicInvitationPath)}&add_account=1`
  )
  await addAccount.click()
  await expect(page.getByText("Add account", { exact: true })).toBeVisible()
  const createAdditionalAccount = page.getByRole("link", {
    name: "Sign Up",
  })
  await expect(createAdditionalAccount).toHaveAttribute(
    "href",
    `/auth/sign-up?redirectTo=${encodeURIComponent(publicInvitationPath)}&add_account=1`
  )
  await createAdditionalAccount.click()
  await expect(page.getByText("Create account", { exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: /sign in/i })).toHaveAttribute(
    "href",
    `/auth/sign-in?redirectTo=${encodeURIComponent(publicInvitationPath)}&add_account=1`
  )

  await page.goto(publicInvitationPath)
  await expect(
    page.getByRole("heading", { name: "Use the invited account" })
  ).toBeVisible()

  await page.getByRole("button", { name: "Switch account" }).click()
  const accountDialog = page.getByRole("dialog", { name: "Switch account" })
  const invitedAccount = accountDialog
    .getByText("new-user@example.com", { exact: true })
    .locator("../..")
  const switchResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/auth/multi-session/set-active") &&
      response.request().method() === "POST"
  )
  await invitedAccount.getByRole("button", { name: "Switch" }).click()
  expect((await switchResponse).ok()).toBeTruthy()

  await expect
    .poll(async () => {
      const sessionCookie = (await context.cookies()).find(
        ({ name }) => name === "e2e-session"
      )
      return sessionCookie?.value
    })
    .toBe("new-user")
  await expect(
    page.getByRole("heading", { name: "Join Alpha Operations" })
  ).toBeVisible()
  await expect(
    page.getByText(
      "admin@example.com invited new-user@example.com to this organization."
    )
  ).toBeVisible()

  const acceptResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/auth/organization/accept-invitation") &&
      response.request().method() === "POST"
  )
  await page.getByRole("button", { name: "Accept invitation" }).click()
  const response = await acceptResponse
  expect(response.ok()).toBeTruthy()
  expect(response.request().postDataJSON()).toEqual({
    invitationId: publicInvitationId,
  })
  await expect(page.getByText("Invitation accepted")).toBeVisible()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByText("Alpha Operations").first()).toBeVisible()
})

test("magic link登録から最初のorganizationとdashboardへ到達できる", async ({
  context,
  page,
}) => {
  await page.goto("/auth/sign-in")

  await expect(page.getByText("Sign In", { exact: true })).toBeVisible()
  const email = page.getByRole("textbox", { name: "Email" })
  await expect(email).toBeEnabled()
  await email.fill("new@example.com")
  const magicLinkResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/auth/sign-in/magic-link") &&
      response.request().method() === "POST"
  )
  await page.getByRole("button", { name: /send magic link/i }).click()
  await expect((await magicLinkResponse).ok()).toBeTruthy()
  const sentStatus = page.getByRole("status")
  await expect(sentStatus).toContainText("Check your email")
  await expect(sentStatus).toContainText("new@example.com")
  await expect(
    page.getByRole("button", { name: "Use another email" })
  ).toBeVisible()

  // Email delivery itself is covered at the package boundary. The E2E harness
  // models opening the one-time link by installing the resulting session.
  await useSession(context, "new-user")
  await page.goto("/settings/organizations")

  await expect(page.getByText("Create your first organization")).toBeVisible()
  await page.getByRole("button", { name: "Create organization" }).click()
  await page.getByLabel("Name").fill("Acme Operations")
  await expect(page.getByLabel("Slug")).toHaveValue("acme-operations")
  await page.getByRole("button", { name: "Create organization" }).click()

  await expect(page.getByText("Acme Operations").first()).toBeVisible()
  await openMobileSidebar(page)
  await page.getByRole("link", { name: "Overview", exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByText("Acme Operations").first()).toBeVisible()
})

test("dashboardからIssue作成とtenant切替を迷わず完了できる", async ({
  context,
  page,
}) => {
  await useSession(context, "admin")
  await page.goto("/organization/alpha-operations/issues")

  await expect(page.getByText("Alpha Operations").first()).toBeVisible()
  await expect(page.getByText("Review tenant audit log")).toBeVisible()
  await expect(page.getByText("Private Beta issue")).toHaveCount(0)

  const reviewIssueRow = page
    .locator("tbody tr")
    .filter({ hasText: "Review tenant audit log" })
  await reviewIssueRow.hover()
  const openReviewAsPage = reviewIssueRow.getByRole("link", {
    name: "Open Review tenant audit log as full page",
  })
  await expect(openReviewAsPage).toBeVisible()
  await expect(openReviewAsPage).toHaveText("Full page")
  await openReviewAsPage.click()
  await expect(page).toHaveURL(/\/organization\/alpha-operations\/issues\/1$/)
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(
    page.getByRole("heading", {
      name: "Review tenant audit log",
      level: 1,
    })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Issue #1", exact: true })
  ).toHaveCount(0)
  await expect(
    page.getByText("Track work for Alpha Operations.", { exact: true })
  ).toHaveCount(0)
  await page.getByRole("button", { name: "Back to issues" }).click()

  await page
    .getByRole("link", { name: "Review tenant audit log", exact: true })
    .click()
  const issueDialog = page.getByRole("dialog", { name: "Issue details" })
  await expect(issueDialog).toBeVisible()
  const modalInset = await issueDialog.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return {
      top: box.top,
      left: box.left,
      right: window.innerWidth - box.right,
      bottom: window.innerHeight - box.bottom,
    }
  })
  expect(modalInset.top).toBeGreaterThanOrEqual(7)
  expect(modalInset.left).toBeGreaterThanOrEqual(7)
  expect(modalInset.right).toBeGreaterThanOrEqual(7)
  expect(modalInset.bottom).toBeGreaterThanOrEqual(7)

  const detailHeader = issueDialog.locator('[data-slot="issue-detail-header"]')
  const detailMetadata = issueDialog.locator('[data-slot="issue-metadata"]')
  const detailDescription = issueDialog.locator(
    '[data-slot="issue-description"]'
  )
  const detailDiscussion = issueDialog.locator('[data-slot="issue-discussion"]')
  const [headerBox, metadataBox, descriptionBox, discussionBox] =
    await Promise.all([
      detailHeader.boundingBox(),
      detailMetadata.boundingBox(),
      detailDescription.boundingBox(),
      detailDiscussion.boundingBox(),
    ])
  expect(headerBox).not.toBeNull()
  expect(metadataBox).not.toBeNull()
  expect(descriptionBox).not.toBeNull()
  expect(discussionBox).not.toBeNull()

  const viewportWidth = page.viewportSize()?.width ?? 0
  if (viewportWidth < 1024) {
    expect(metadataBox?.y ?? 0).toBeGreaterThanOrEqual(
      (headerBox?.y ?? 0) + (headerBox?.height ?? 0)
    )
    expect(descriptionBox?.y ?? 0).toBeGreaterThanOrEqual(
      (metadataBox?.y ?? 0) + (metadataBox?.height ?? 0)
    )
    expect(discussionBox?.y ?? 0).toBeGreaterThanOrEqual(
      (descriptionBox?.y ?? 0) + (descriptionBox?.height ?? 0)
    )
    expect(
      Math.abs((discussionBox?.width ?? 0) - (descriptionBox?.width ?? 0))
    ).toBeLessThan(2)

    const headerCenterY = (headerBox?.y ?? 0) + (headerBox?.height ?? 0) / 2
    const headerControlBoxes = await Promise.all(
      [
        detailHeader.getByText("#1", { exact: true }),
        detailHeader.getByRole("button", { name: "Edit issue title" }),
        detailHeader.getByRole("button", { name: "Open full page" }),
      ].map((control) => control.boundingBox())
    )
    for (const controlBox of headerControlBoxes) {
      expect(controlBox).not.toBeNull()
      expect(
        Math.abs(
          (controlBox?.y ?? 0) + (controlBox?.height ?? 0) / 2 - headerCenterY
        )
      ).toBeLessThan(4)
    }
    await detailHeader.getByRole("button", { name: "Edit issue title" }).click()
    await expect(
      detailHeader.getByRole("button", { name: "Save title" })
    ).toBeDisabled()
    expect(
      await issueDialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth
      )
    ).toBe(true)
    await detailHeader.getByRole("button", { name: "Cancel" }).click()
  } else {
    expect(
      Math.abs((discussionBox?.width ?? 0) - (descriptionBox?.width ?? 0))
    ).toBeLessThan(2)
    expect(metadataBox?.x ?? 0).toBeGreaterThan(
      (descriptionBox?.x ?? 0) + (descriptionBox?.width ?? 0)
    )
    expect(headerBox?.width ?? 0).toBeGreaterThan(
      (descriptionBox?.width ?? 0) + 200
    )
    expect(
      await detailMetadata.evaluate(
        (element) => window.getComputedStyle(element).position
      )
    ).toBe("sticky")
  }
  await page.keyboard.press("Escape")
  await expect(page).toHaveURL(/\/organization\/alpha-operations\/issues$/)

  await page.getByRole("button", { name: "New issue" }).click()
  await page.getByLabel("Title").fill("Document tenant switch runbook")
  await page.getByRole("button", { name: "Create issue" }).click()
  await expect(
    page.getByText("Document tenant switch runbook").first()
  ).toBeVisible()

  await openOrganizationSwitcher(page)
  await page.getByRole("menuitem", { name: "Beta Support" }).click()
  await expect(page.getByText("Organization switched")).toBeVisible()
  await expect(page.getByText("Beta Support").first()).toBeVisible()
  await expect(page.getByText("Private Beta issue")).toBeVisible()
  await expect(page.getByText("Review tenant audit log")).toHaveCount(0)
})

test("organization slug route上でactive tenantを往復してshellを同期する", async ({
  context,
  page,
}) => {
  await useSession(context, "admin")
  await page.goto("/organization/beta-support/members")

  await expect(
    page.getByRole("region", { name: "Switch to Beta Support" })
  ).toBeVisible()
  await openOrganizationSwitcher(page)
  const activateBetaResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/organizations/org-b/activate") &&
      response.request().method() === "POST"
  )
  await page.getByRole("menuitem", { name: "Beta Support" }).click()
  expect((await activateBetaResponse).ok()).toBeTruthy()

  await expect(page).toHaveURL(/\/organization\/beta-support\/members$/)
  await expect(
    page.getByRole("region", { name: "Switch to Beta Support" })
  ).toHaveCount(0)
  await expect(
    page
      .locator('[data-slot="console-header"]')
      .getByText("Beta Support", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByText("Viewing another organization", { exact: true })
  ).toHaveCount(0)

  await openOrganizationSwitcher(page)
  await expect(
    page
      .locator(
        '[data-slot="dropdown-menu-trigger"][data-sidebar="menu-button"]'
      )
      .filter({ hasText: "Beta Support" })
  ).toBeVisible()
  const activateAlphaResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/organizations/org-a/activate") &&
      response.request().method() === "POST"
  )
  await page.getByRole("menuitem", { name: "Alpha Operations" }).click()
  expect((await activateAlphaResponse).ok()).toBeTruthy()

  await expect(page).toHaveURL(/\/organization\/alpha-operations\/members$/)
  await expect(
    page
      .locator('[data-slot="console-header"]')
      .getByText("Alpha Operations", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByText("Viewing another organization", { exact: true })
  ).toHaveCount(0)
})

test("tenant切替のserver errorは安全な詳細を示して再試行できる", async ({
  allowClientErrors,
  context,
  page,
}) => {
  allowClientErrors(/Failed to load resource.*500/)
  await useSession(context, "admin")
  const faultResponse = await context.request.post(
    `${mockApiUrl}/__e2e/faults`,
    {
      data: {
        path: "/organizations/org-b/activate",
        method: "POST",
        status: 500,
        code: "internal_error",
        message: "provider failure sk_live_must_never_render",
        requestId: "req_e2e_org_switch_01",
      },
    }
  )
  expect(faultResponse.status()).toBe(201)

  await page.goto("/organization/alpha-operations/issues")
  await openOrganizationSwitcher(page)
  const failedActivation = page.waitForResponse(
    (response) =>
      response.url().endsWith("/organizations/org-b/activate") &&
      response.request().method() === "POST"
  )
  await page.getByRole("menuitem", { name: "Beta Support" }).click()
  expect((await failedActivation).status()).toBe(500)

  await expect(page.getByText("Could not switch organization")).toBeVisible()
  await expect(
    page.getByText(
      "Try again. If the problem continues, contact support. Reference ID: req_e2e_org_switch_01"
    )
  ).toBeVisible()
  await expect(page.getByText(/sk_live_must_never_render/)).toHaveCount(0)
  await expect(page.getByText("Alpha Operations").first()).toBeVisible()

  await openOrganizationSwitcher(page)
  await page.getByRole("menuitem", { name: "Beta Support" }).click()
  await expect(page.getByText("Organization switched")).toBeVisible()
  await expect(page.getByText("Beta Support").first()).toBeVisible()
})

test("複数organizationでactive未選択なら明示選択を要求する", async ({
  context,
  page,
}) => {
  await useSession(context, "unselected")
  await page.goto("/dashboard")

  await expect(page).toHaveURL(/\/settings\/organizations$/)
  await expect(page.getByText("Alpha Operations").first()).toBeVisible()
  await openOrganizationSwitcher(page)

  const activateResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/organizations/org-a/activate") &&
      response.request().method() === "POST"
  )
  await page.getByRole("menuitem", { name: "Alpha Operations" }).click()
  await expect((await activateResponse).ok()).toBeTruthy()
  await expect(page.getByText("Organization switched")).toBeVisible()
  await expect(
    page
      .locator('[data-slot="console-header"]')
      .getByText("Alpha Operations", { exact: true })
  ).toBeVisible()

  await page.goto("/dashboard")
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByText("Alpha Operations").first()).toBeVisible()
})

test("stale sessionではpasskey追加前に再認証しfocusを維持する", async ({
  allowClientErrors,
  context,
  page,
}) => {
  allowClientErrors(/Failed to load resource.*403/)
  await useSession(context, "admin")
  await page.goto("/settings/account")

  const addPasskey = page.getByRole("button", { name: "Add passkey" })
  await expect(addPasskey).toBeVisible()
  const staleResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/auth/passkey/generate-register-options") &&
      response.request().method() === "GET"
  )
  await addPasskey.click()
  expect((await staleResponse).status()).toBe(403)

  await expect(
    page.getByRole("alertdialog", {
      name: "Sign in again to add a passkey",
    })
  ).toBeVisible()
  await expect(page.getByText(/private session timestamp/u)).toHaveCount(0)

  await page.keyboard.press("Escape")
  await expect(addPasskey).toBeFocused()

  await addPasskey.click()
  await page.getByRole("button", { name: "Continue to sign in" }).click()
  await expect(page).toHaveURL(
    "/auth/sign-in?reauth=1&action=account.passkey.add&redirectTo=/settings/account"
  )
  await expect(page.getByText("Security check", { exact: true })).toBeVisible()
})

test("member権限とtenant境界をAPIと画面の両方で拒否する", async ({
  context,
  page,
}) => {
  await useSession(context, "admin")
  await page.goto("/organization/alpha-operations/dashboard")

  const [inactiveTenantResponse, missingTenantResponse] = await Promise.all([
    context.request.get(`${mockApiUrl}/issues?organizationId=org-b`),
    context.request.get(`${mockApiUrl}/issues?organizationId=org-forbidden`),
  ])

  expect(inactiveTenantResponse.status()).toBe(409)
  expect(await inactiveTenantResponse.json()).toEqual(
    expect.objectContaining({
      error: expect.objectContaining({
        code: "active_organization_mismatch",
      }),
    })
  )
  expect(missingTenantResponse.status()).toBe(404)

  const activateResponse = await context.request.post(
    `${mockApiUrl}/organizations/org-b/activate`
  )
  expect(activateResponse.ok()).toBeTruthy()
  const roleResponse = await context.request.patch(
    `${mockApiUrl}/organizations/org-b`,
    { data: { name: "Escalated" } }
  )
  expect(roleResponse.status()).toBe(403)

  const invitationRequests: string[] = []
  page.on("request", (request) => {
    if (request.url().endsWith("/organizations/org-b/invitations")) {
      invitationRequests.push(request.url())
    }
  })
  await page.goto("/organization/beta-support/settings")
  await expect(
    page.getByRole("heading", { name: "Organization settings" })
  ).toBeVisible()
  await expect(
    page.getByRole("region", {
      name: "You cannot edit this organization",
    })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Delete organization" })
  ).toHaveCount(0)
  await page.getByRole("link", { name: "View members" }).click()
  await expect(page).toHaveURL(/\/organization\/beta-support\/members$/)
  await expect(
    page.getByRole("heading", { name: "Members", exact: true })
  ).toBeVisible()
  expect(invitationRequests).toEqual([])
})

test("member招待・role編集・削除とsession revokeを画面から完了できる", async ({
  allowClientErrors,
  context,
  page,
}) => {
  allowClientErrors(/Failed to load resource.*409/)
  await useSession(context, "admin")
  const invitationFaultResponse = await context.request.post(
    `${mockApiUrl}/__e2e/faults`,
    {
      data: {
        path: "/organizations/org-a/invitations",
        method: "POST",
        status: 409,
        code: "conflict",
        message: "One or more email addresses cannot be invited.",
        requestId: "req_e2e_bulk_invitation_01",
      },
    }
  )
  expect(invitationFaultResponse.status()).toBe(201)
  await page.goto("/organization/alpha-operations/members")

  await expect(
    page.getByRole("heading", { name: "Members", exact: true })
  ).toBeVisible()
  await expect(page.getByText("Kai Brooks", { exact: true })).toBeVisible()

  const roleTrigger = page.getByRole("combobox", {
    name: "Role for Kai Brooks",
  })
  await roleTrigger.click()
  const roleResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/organizations/org-a/members/member-kai") &&
      response.request().method() === "PATCH"
  )
  await page.getByRole("option", { name: "Admin", exact: true }).click()
  expect((await roleResponsePromise).ok()).toBeTruthy()
  await expect(page.getByText("Role updated")).toBeVisible()
  await expect(roleTrigger).toContainText("Admin")

  await page.getByRole("button", { name: "Remove Kai Brooks" }).click()
  const removeDialog = page.getByRole("alertdialog", {
    name: "Remove Kai Brooks?",
  })
  await expect(removeDialog).toBeVisible()
  await removeDialog
    .getByRole("textbox", { name: "Member email" })
    .fill("kai@example.com")
  const removeResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/organizations/org-a/members/member-kai") &&
      response.request().method() === "DELETE"
  )
  await removeDialog.getByRole("button", { name: "Remove member" }).click()
  expect((await removeResponsePromise).ok()).toBeTruthy()
  await expect(page.getByText("Member removed")).toBeVisible()
  await expect(page.getByText("Kai Brooks", { exact: true })).toHaveCount(0)

  await page.getByRole("button", { name: "Invite members" }).click()
  const inviteDialog = page.getByRole("dialog", { name: "Invite members" })
  const invitationEmails = inviteDialog.getByRole("textbox", {
    name: "Email addresses",
  })
  const rawInvitationEmails =
    "Browser-One@Example.com, browser-two@example.com\nbrowser-one@example.com"
  await invitationEmails.fill(rawInvitationEmails)

  const failedInvitationResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/organizations/org-a/invitations") &&
      response.request().method() === "POST"
  )
  await inviteDialog.getByRole("button", { name: "Send invitations" }).click()
  expect((await failedInvitationResponsePromise).status()).toBe(409)
  await expect(
    inviteDialog.getByText("One or more email addresses cannot be invited.")
  ).toBeVisible()
  await expect(invitationEmails).toHaveValue(rawInvitationEmails)
  await expect(invitationEmails).toHaveAttribute("aria-invalid", "false")

  const invitationResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/organizations/org-a/invitations") &&
      response.request().method() === "POST"
  )
  await inviteDialog.getByRole("button", { name: "Send invitations" }).click()
  const invitationResponse = await invitationResponsePromise
  expect(invitationResponse.status()).toBe(201)
  expect(invitationResponse.request().postDataJSON()).toEqual({
    emails: ["browser-one@example.com", "browser-two@example.com"],
    role: "member",
  })
  await expect(page.getByText("2 invitations queued")).toBeVisible()
  await expect(
    page.getByText("browser-one@example.com", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByText("browser-two@example.com", { exact: true })
  ).toBeVisible()

  await openMobileSidebar(page)
  await page.getByRole("link", { name: "Account", exact: true }).click()
  await expect(page).toHaveURL(/\/settings\/account$/)
  await expect(
    page.getByRole("heading", { name: "Signed-in devices" })
  ).toBeVisible()
  await expect(page.getByText("iPhone (Safari)")).toBeVisible()
  await page.getByRole("button", { name: "Revoke", exact: true }).click()
  const revokeDialog = page.getByRole("alertdialog", {
    name: "Revoke this session?",
  })
  const revokeResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/me/sessions/session-admin-other") &&
      response.request().method() === "DELETE"
  )
  await revokeDialog.getByRole("button", { name: "Revoke session" }).click()
  expect((await revokeResponsePromise).ok()).toBeTruthy()
  await expect(page.getByText("Session revoked")).toBeVisible()
  await expect(page.getByText("iPhone (Safari)")).toHaveCount(0)
})

test("memberを検索・参加日順に並べ替え、招待を再送・復活できる", async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chrome",
    "横長tableの検索・sort・招待再送契約はdesktopで一度検証する"
  )

  await useSession(context, "admin")
  await page.goto("/organization/alpha-operations/members")

  const memberTable = page.getByRole("table", {
    name: "Members of Alpha Operations",
  })
  await expect(memberTable).toBeVisible()
  const kaiRow = memberTable.getByRole("row").filter({
    hasText: "kai@example.com",
  })
  await expect(kaiRow).toContainText("Jul 3, 2026")

  const memberSearch = page.getByRole("searchbox", {
    name: "Search members by name or email",
  })
  await memberSearch.fill("kai@example.com")
  await expect(kaiRow).toBeVisible()
  await expect(
    memberTable.getByText("Jordan Lee", { exact: true })
  ).toHaveCount(0)
  await expect(page.getByText("1 of 3 members", { exact: true })).toBeVisible()
  await memberSearch.clear()

  await memberTable.getByRole("button", { name: "Sort by joined" }).click()
  await memberTable
    .getByRole("button", {
      name: "Sort by joined, currently ascending",
    })
    .click()
  await expect
    .poll(async () => memberTable.locator("tbody tr").allTextContents())
    .toEqual([
      expect.stringContaining("Kai Brooks"),
      expect.stringContaining("Jordan Lee"),
      expect.stringContaining("Admin User"),
    ])

  const invitationTable = page.getByRole("table", {
    name: "Invitations for Alpha Operations",
  })
  await expect(invitationTable).toBeVisible()
  const pendingRow = invitationTable.getByRole("row").filter({
    hasText: "pending@example.com",
  })
  await expect(pendingRow).toContainText("Jul 14, 2026")
  await expect(pendingRow).toContainText("Aug 14, 2026")
  await expect(pendingRow).toContainText("Admin User")

  const resendPendingResponse = page.waitForResponse(
    (response) =>
      response
        .url()
        .endsWith("/organizations/org-a/invitations/invitation-a-1/resend") &&
      response.request().method() === "POST"
  )
  await pendingRow.getByRole("button", { name: "Resend" }).click()
  expect(await (await resendPendingResponse).json()).toEqual(
    expect.objectContaining({ delivery: "queued", revived: false })
  )
  await expect(page.getByText("Invitation email queued again")).toBeVisible()

  const expiredRow = invitationTable.getByRole("row").filter({
    hasText: "expired@example.com",
  })
  await expect(expiredRow).toContainText("Expired")
  await expect(expiredRow).toContainText("Jul 10, 2026")
  await expect(expiredRow).toContainText("Admin User")
  const resendExpiredResponse = page.waitForResponse(
    (response) =>
      response
        .url()
        .endsWith(
          "/organizations/org-a/invitations/invitation-expired/resend"
        ) && response.request().method() === "POST"
  )
  await expiredRow.getByRole("button", { name: "Renew & resend" }).click()
  expect(await (await resendExpiredResponse).json()).toEqual(
    expect.objectContaining({
      delivery: "queued",
      invitation: expect.objectContaining({ status: "pending" }),
      revived: true,
    })
  )
  await expect(page.getByText("Invitation renewed and queued")).toBeVisible()
  await expect(expiredRow).toContainText("Pending")
  await expect(expiredRow).toContainText("Aug 14, 2026")
})

test("mobile sidebarを閉じて別accountへ安全に切り替えられる", async ({
  context,
  page,
}) => {
  await useSession(context, "admin")
  await page.goto("/settings/organizations")
  const organizationsTable = page.getByRole("table", {
    name: "Organizations attached to your account",
  })
  await expect(
    organizationsTable.getByText("Alpha Operations", { exact: true })
  ).toBeVisible()
  await expect(
    organizationsTable.getByText("Beta Support", { exact: true })
  ).toBeVisible()
  await expect(
    organizationsTable.getByText("Invitation Operations", { exact: true })
  ).toBeVisible()
  await openMobileSidebar(page)

  await page
    .getByRole("button", { name: /Admin User admin@example\.com/i })
    .click()
  await page.getByRole("menuitem", { name: "Switch account" }).click()

  const accountDialog = page.getByRole("dialog", { name: "Switch account" })
  await expect(accountDialog).toBeVisible()
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await expect(page.getByRole("dialog", { name: "Sidebar" })).toBeHidden()
  }
  const nextAccount = accountDialog
    .getByText("new-user@example.com", { exact: true })
    .locator("../..")
  const switchResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/auth/multi-session/set-active") &&
      response.request().method() === "POST"
  )
  await nextAccount.getByRole("button", { name: "Switch" }).click()
  expect((await switchResponsePromise).ok()).toBeTruthy()
  await expect
    .poll(async () => {
      const sessionCookie = (await context.cookies()).find(
        ({ name }) => name === "e2e-session"
      )
      return sessionCookie?.value
    })
    .toBe("new-user")

  await expect(page).toHaveURL(/\/settings\/organizations$/)
  await expect(page.getByText("Create your first organization")).toBeVisible()
  await expect(page.getByText("Alpha Operations", { exact: true })).toHaveCount(
    0
  )
  await expect(page.getByText("Beta Support", { exact: true })).toHaveCount(0)
  await expect(
    page.getByText("Invitation Operations", { exact: true })
  ).toHaveCount(0)
  await openMobileSidebar(page)
  await expect(page.getByText("New User", { exact: true })).toBeVisible()
})

test("Issue詳細の期日・更新・comment・削除を一つのCRUD導線で扱える", async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chrome",
    "詳細CRUDはdesktopで一度検証し、主要作成・切替導線は全projectで検証する"
  )

  await useSession(context, "admin")
  await page.goto("/organization/alpha-operations/issues")
  await expect(
    page.getByLabel("Due date and time for Review tenant audit log")
  ).toContainText("Jul 21, 2026")
  await context.request.post(`${mockApiUrl}/__e2e/request-delays`, {
    data: { path: "/issues/by-number/1", method: "GET", delayMs: 800 },
  })
  await page
    .getByRole("link", { name: "Review tenant audit log", exact: true })
    .click()

  await expect(page).toHaveURL(/\/organization\/alpha-operations\/issues\/1$/)
  const issueDialog = page.getByRole("dialog", { name: "Issue details" })
  await expect(issueDialog).toBeVisible()
  await issueDialog.evaluate((element) => {
    element.setAttribute("data-e2e-persistent-shell", "true")
  })
  await expect(
    issueDialog.getByRole("status", { name: "Loading issue details" })
  ).toBeVisible()
  await expect
    .poll(
      async () =>
        issueDialog.evaluate((element) => element.getAnimations().length),
      { message: "the initial modal animation should settle on the skeleton" }
    )
    .toBe(0)
  const loadingBox = await issueDialog.boundingBox()
  await expect(
    issueDialog.getByRole("heading", { name: "Review tenant audit log" })
  ).toBeVisible()
  await expect(issueDialog).toHaveAttribute("data-e2e-persistent-shell", "true")
  const issueBox = await issueDialog.boundingBox()
  expect(loadingBox).not.toBeNull()
  expect(issueBox).not.toBeNull()
  expect(
    Math.abs((loadingBox?.width ?? 0) - (issueBox?.width ?? 0))
  ).toBeLessThan(2)
  expect(
    Math.abs((loadingBox?.height ?? 0) - (issueBox?.height ?? 0))
  ).toBeLessThan(2)
  expect(
    await issueDialog.evaluate((element) => element.getAnimations().length)
  ).toBe(0)
  await expect(
    issueDialog
      .getByRole("combobox", { name: "Issue assignee" })
      .locator('[data-slot="avatar"]')
  ).toBeVisible()
  await expect(page.getByText("changed assignee from")).toBeVisible()
  await expect(
    page.getByText("Jordan Lee", { exact: true }).last()
  ).toBeVisible()
  await expect(page.getByText("user-jordan", { exact: true })).toHaveCount(0)
  await page.goBack()
  await expect(page).toHaveURL(/\/organization\/alpha-operations\/issues$/)
  await page
    .getByRole("link", { name: "Review tenant audit log", exact: true })
    .click()

  await page.getByRole("button", { name: "Edit description" }).click()
  await page
    .getByRole("textbox", { name: "Description" })
    .fill("Unsaved issue description")
  await page.getByLabel("Add comment").fill("Unsaved full-page draft")
  await page.getByRole("button", { name: "Open full page" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.getByRole("textbox", { name: "Description" })).toHaveValue(
    "Unsaved issue description"
  )
  await expect(page.getByLabel("Add comment")).toHaveValue(
    "Unsaved full-page draft"
  )

  await page.evaluate(() => window.history.back())
  const browserBackDiscardDialog = page.getByRole("alertdialog")
  await expect(browserBackDiscardDialog).toContainText(
    "Discard unsaved changes?"
  )
  await browserBackDiscardDialog
    .getByRole("button", { name: "Keep editing" })
    .click()
  await expect(page.getByRole("textbox", { name: "Description" })).toHaveValue(
    "Unsaved issue description"
  )
  await expect(page.getByLabel("Add comment")).toHaveValue(
    "Unsaved full-page draft"
  )
  await page.getByRole("button", { name: "Back to issues" }).click()
  const fullPageDiscardDialog = page.getByRole("alertdialog")
  await expect(fullPageDiscardDialog).toContainText("Discard unsaved changes?")
  await fullPageDiscardDialog
    .getByRole("button", { name: "Discard changes" })
    .click()
  await expect(page).toHaveURL(/\/organization\/alpha-operations\/issues$/)

  await page
    .getByRole("link", { name: "Review tenant audit log", exact: true })
    .click()
  await page.getByLabel("Add comment").fill("Unsaved comment draft")
  await page.keyboard.press("Escape")
  const discardDialog = page.getByRole("alertdialog")
  await expect(discardDialog).toContainText("Discard unsaved changes?")
  await discardDialog.getByRole("button", { name: "Discard changes" }).click()
  await expect(page).toHaveURL(/\/organization\/alpha-operations\/issues$/)

  await page
    .getByRole("link", { name: "Review tenant audit log", exact: true })
    .click()

  await expect(
    page.getByLabel("Issue due date and time", { exact: true })
  ).toContainText("Jul 21, 2026")
  await expect(
    page.getByText("Tenant boundary verified in the API integration suite.")
  ).toBeVisible()

  await page.getByRole("button", { name: "Edit issue title" }).click()
  const title = page.getByLabel("Issue title")
  const saveTitle = page.getByRole("button", { name: "Save title" })
  await expect(saveTitle).toBeDisabled()
  await title.clear()
  await title.fill("Review tenant audit evidence")
  await expect(saveTitle).toBeEnabled()
  const updateResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/issues/issue-a-1") &&
      response.request().method() === "PATCH"
  )
  await saveTitle.click()
  const issueUpdateResponse = await updateResponse
  expect(issueUpdateResponse.ok()).toBeTruthy()
  expect(issueUpdateResponse.request().postDataJSON()).toEqual({
    organizationId: "org-a",
    title: "Review tenant audit evidence",
  })
  await expect(
    page.getByText("Review tenant audit evidence").first()
  ).toBeVisible()

  await page.getByLabel("Add comment").fill("Verified from the browser journey")
  const createCommentResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/issues/issue-a-1/comments") &&
      response.request().method() === "POST"
  )
  await page.getByRole("button", { name: "Comment" }).click()
  expect((await createCommentResponse).status()).toBe(201)
  await expect(
    page.getByText("Verified from the browser journey")
  ).toBeVisible()

  let commentCard = page
    .locator('[data-slot="card"]')
    .filter({ hasText: "Verified from the browser journey" })
  await commentCard.getByRole("button", { name: "Edit" }).click()
  const editComment = page.getByLabel("Edit comment")
  await editComment.clear()
  await editComment.fill("Verified and documented from the browser journey")
  const updateCommentResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/issues/issue-a-1/comments/comment-admin-2") &&
      response.request().method() === "PATCH"
  )
  await page.getByRole("button", { name: "Save comment" }).click()
  expect((await updateCommentResponse).ok()).toBeTruthy()
  await expect(
    page.getByText("Verified and documented from the browser journey")
  ).toBeVisible()

  commentCard = page
    .locator('[data-slot="card"]')
    .filter({ hasText: "Verified and documented from the browser journey" })
  await commentCard.getByRole("button", { name: "Delete" }).click()
  const deleteCommentResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/issues/issue-a-1/comments/comment-admin-2") &&
      response.request().method() === "DELETE"
  )
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete comment" })
    .click()
  expect((await deleteCommentResponse).ok()).toBeTruthy()
  await expect(
    page.getByText("Verified and documented from the browser journey")
  ).toHaveCount(0)

  await page.keyboard.press("Escape")
  await page
    .getByRole("button", {
      name: "Actions for Review tenant audit evidence",
    })
    .click()
  await page.getByRole("menuitem", { name: "Delete issue" }).click()
  const deleteIssueResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/issues/issue-a-1") &&
      response.request().method() === "DELETE"
  )
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete issue" })
    .click()
  expect((await deleteIssueResponse).ok()).toBeTruthy()
  await expect(page.getByText("Review tenant audit evidence")).toHaveCount(0)
})

test("Super Adminだけがorganizationを二重確認して即時削除できる", async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chrome",
    "破壊的操作の契約と遷移はdesktopで一度だけ検証する"
  )

  await useSession(context, "admin")

  expect(
    (
      await context.request.post(`${mockApiUrl}/organizations/org-b/activate`)
    ).ok()
  ).toBeTruthy()
  const roleResponse = await context.request.delete(
    `${mockApiUrl}/organizations/org-b`,
    {
      data: {
        slug: "beta-support",
        confirmation: "DELETE",
        idempotencyKey: "delete_org_b_member_01",
      },
    }
  )
  expect(roleResponse.status()).toBe(403)
  expect(
    (
      await context.request.post(`${mockApiUrl}/organizations/org-a/activate`)
    ).ok()
  ).toBeTruthy()

  const [slugResponse, confirmationResponse, keyResponse] = await Promise.all([
    context.request.delete(`${mockApiUrl}/organizations/org-a`, {
      data: {
        slug: "wrong-slug",
        confirmation: "DELETE",
        idempotencyKey: "delete_org_a_wrong_slug_01",
      },
    }),
    context.request.delete(`${mockApiUrl}/organizations/org-a`, {
      data: {
        slug: "alpha-operations",
        confirmation: "delete",
        idempotencyKey: "delete_org_a_wrong_confirmation_01",
      },
    }),
    context.request.delete(`${mockApiUrl}/organizations/org-a`, {
      data: {
        slug: "alpha-operations",
        confirmation: "DELETE",
        idempotencyKey: "short",
      },
    }),
  ])

  expect(slugResponse.status()).toBe(400)
  expect(confirmationResponse.status()).toBe(400)
  expect(keyResponse.status()).toBe(400)

  await page.goto("/organization/alpha-operations/settings")
  await expect(page.getByRole("heading", { name: "Danger zone" })).toBeVisible()
  await page.getByRole("button", { name: "Delete organization" }).click()

  const dialog = page.getByRole("alertdialog", {
    name: "Delete Alpha Operations?",
  })
  const permanentlyDelete = dialog.getByRole("button", {
    name: "Permanently delete",
  })
  await expect(permanentlyDelete).toBeDisabled()
  await dialog.getByLabel("Type the organization slug").fill("alpha-operations")
  await expect(permanentlyDelete).toBeDisabled()
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE")
  await expect(permanentlyDelete).toBeEnabled()

  const deleteRequestPromise = page.waitForRequest(
    (request) =>
      request.url().endsWith("/organizations/org-a") &&
      request.method() === "DELETE"
  )
  const deleteResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/organizations/org-a") &&
      response.request().method() === "DELETE"
  )
  await permanentlyDelete.click()
  const [deleteRequest, deleteResponse] = await Promise.all([
    deleteRequestPromise,
    deleteResponsePromise,
  ])
  expect(deleteResponse.ok()).toBeTruthy()

  const deletePayload = deleteRequest.postDataJSON()
  expect(deletePayload).toEqual({
    slug: "alpha-operations",
    confirmation: "DELETE",
    idempotencyKey: expect.stringMatching(/^delete_org_[a-f0-9]{32}$/),
  })
  const deletionReceipt = await deleteResponse.json()
  expect(deletionReceipt).toEqual({
    deletionId: "deletion-admin-1",
    organizationId: "org-a",
    status: "deleted",
  })

  await expect(page).toHaveURL(/\/settings\/organizations$/)
  await expect(page.getByText("Organization deleted")).toBeVisible()
  await expect(page.getByText("Alpha Operations", { exact: true })).toHaveCount(
    0
  )
  await expect(page.getByText("Beta Support", { exact: true })).toBeVisible()

  const replayResponse = await context.request.delete(
    `${mockApiUrl}/organizations/org-a`,
    { data: deletePayload }
  )
  expect(replayResponse.status()).toBe(200)
  expect(await replayResponse.json()).toEqual(deletionReceipt)
  const remainingOrganizations = await (
    await context.request.get(`${mockApiUrl}/organizations`)
  ).json()
  expect(remainingOrganizations).toHaveLength(2)
  expect(remainingOrganizations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "org-b", name: "Beta Support" }),
      expect.objectContaining({
        id: "org-invitations",
        name: "Invitation Operations",
      }),
    ])
  )
})

test("organization・member・invitation・session・一時faultを決定的に再現する", async ({
  context,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chrome",
    "mock API contractはbrowser engine非依存なのでdesktopで一度だけ検証する"
  )

  await useSession(context, "admin")

  const mismatchedInvitationResponse = await context.request.get(
    `${mockApiUrl}/auth/organization/get-invitation?id=${publicInvitationId}`
  )
  expect(mismatchedInvitationResponse.status()).toBe(403)
  expect(await mismatchedInvitationResponse.json()).toEqual(
    expect.objectContaining({
      code: "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION",
    })
  )
  const invalidInvitationResponse = await context.request.get(
    `${mockApiUrl}/auth/organization/get-invitation?id=missing-invitation`
  )
  expect(invalidInvitationResponse.status()).toBe(400)

  const issuesResponse = await context.request.get(
    `${mockApiUrl}/issues?organizationId=org-a`
  )
  expect(await issuesResponse.json()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "issue-a-1",
        dueDate: "2026-07-21T09:30:00.000Z",
      }),
    ])
  )

  const organizationResponse = await context.request.patch(
    `${mockApiUrl}/organizations/org-a`,
    { data: { name: "Alpha Platform" } }
  )
  expect(await organizationResponse.json()).toEqual(
    expect.objectContaining({ id: "org-a", name: "Alpha Platform" })
  )

  const memberResponse = await context.request.patch(
    `${mockApiUrl}/organizations/org-a/members/member-kai`,
    { data: { role: "admin" } }
  )
  expect(await memberResponse.json()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "member-kai", role: "admin" }),
    ])
  )

  const invitationResponse = await context.request.post(
    `${mockApiUrl}/organizations/org-a/invitations`,
    {
      data: {
        emails: [
          "Browser-E2E@example.com",
          "second-e2e@example.com",
          "browser-e2e@example.com",
        ],
        role: "member",
      },
    }
  )
  expect(invitationResponse.status()).toBe(201)
  expect(await invitationResponse.json()).toEqual(
    expect.objectContaining({
      invitations: [
        expect.objectContaining({
          id: "invitation-admin-2",
          email: "browser-e2e@example.com",
          status: "pending",
          inviter: expect.objectContaining({
            id: "user-admin",
            email: "admin@example.com",
          }),
        }),
        expect.objectContaining({
          id: "invitation-admin-3",
          email: "second-e2e@example.com",
          status: "pending",
        }),
      ],
      queuedCount: 2,
      delivery: "queued",
    })
  )

  const atomicConflictResponse = await context.request.post(
    `${mockApiUrl}/organizations/org-a/invitations`,
    {
      data: {
        emails: ["pending@example.com", "must-not-persist@example.com"],
        role: "member",
      },
    }
  )
  expect(atomicConflictResponse.status()).toBe(409)
  expect(await atomicConflictResponse.json()).toEqual(
    expect.objectContaining({
      error: expect.objectContaining({
        code: "conflict",
        fieldErrors: {
          emails: ["One or more email addresses cannot be invited."],
        },
        requestId: "req_e2e_default",
      }),
    })
  )
  const invitationsAfterConflict = await context.request.get(
    `${mockApiUrl}/organizations/org-a/invitations`
  )
  expect(
    (await invitationsAfterConflict.json()).some(
      (invitation: { email?: unknown }) =>
        invitation.email === "must-not-persist@example.com"
    )
  ).toBe(false)

  const resendPendingResponse = await context.request.post(
    `${mockApiUrl}/organizations/org-a/invitations/invitation-a-1/resend`
  )
  expect(await resendPendingResponse.json()).toEqual(
    expect.objectContaining({
      delivery: "queued",
      invitation: expect.objectContaining({
        id: "invitation-a-1",
        inviter: expect.objectContaining({ email: "admin@example.com" }),
        status: "pending",
      }),
      revived: false,
    })
  )

  const reviveExpiredResponse = await context.request.post(
    `${mockApiUrl}/organizations/org-a/invitations/invitation-expired/resend`
  )
  expect(await reviveExpiredResponse.json()).toEqual(
    expect.objectContaining({
      delivery: "queued",
      invitation: expect.objectContaining({
        expiresAt: "2026-08-14T09:00:00.000Z",
        id: "invitation-expired",
        status: "pending",
      }),
      revived: true,
    })
  )

  const cancelInvitationResponse = await context.request.delete(
    `${mockApiUrl}/organizations/org-a/invitations/invitation-admin-2`
  )
  expect(await cancelInvitationResponse.json()).toEqual({
    id: "invitation-admin-2",
    status: "canceled",
  })

  const sessionsResponse = await context.request.get(
    `${mockApiUrl}/me/sessions`
  )
  expect(await sessionsResponse.json()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "session-admin-current", current: true }),
      expect.objectContaining({ id: "session-admin-other", current: false }),
    ])
  )
  const revokeSessionResponse = await context.request.delete(
    `${mockApiUrl}/me/sessions/session-admin-other`
  )
  expect(await revokeSessionResponse.json()).toEqual({
    id: "session-admin-other",
  })

  const faultConfigurationResponse = await context.request.post(
    `${mockApiUrl}/__e2e/faults`,
    {
      data: {
        path: "/me",
        method: "GET",
        status: 503,
        code: "dependency_unavailable",
        message: "Injected temporary outage",
      },
    }
  )
  expect(faultConfigurationResponse.status()).toBe(201)
  const faultResponse = await context.request.get(`${mockApiUrl}/me`)
  expect(faultResponse.status()).toBe(503)
  expect(await faultResponse.json()).toEqual({
    error: {
      code: "dependency_unavailable",
      message: "Injected temporary outage",
      requestId: "req_e2e_default",
    },
  })
  expect((await context.request.get(`${mockApiUrl}/me`)).ok()).toBeTruthy()
})
