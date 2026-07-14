import type { BrowserContext, Page } from "@playwright/test"

import { expect, test } from "./fixtures/test"

const mockApiUrl = "http://127.0.0.1:3001"

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
    .filter({ hasText: /alpha operations|choose organization/i })
    .click()
}

test.beforeEach(async () => {
  await resetMockApi()
})

test("magic link登録から最初のorganizationとdashboardへ到達できる", async ({
  context,
  page,
}) => {
  await page.goto("/auth/sign-in")

  await expect(page.getByText("Sign In", { exact: true })).toBeVisible()
  const email = page.getByRole("textbox", { name: "Email" })
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
  await page.goto("/dashboard/todos")

  await expect(page.getByText("Alpha Operations").first()).toBeVisible()
  await expect(page.getByText("Review tenant audit log")).toBeVisible()
  await expect(page.getByText("Private Beta issue")).toHaveCount(0)

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

  await page.goto("/dashboard")
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByText("Alpha Operations").first()).toBeVisible()
})

test("member権限とtenant境界をAPIと画面の両方で拒否する", async ({
  context,
  page,
}) => {
  await useSession(context, "admin")
  await page.goto("/dashboard")

  const [inactiveTenantResponse, missingTenantResponse] = await Promise.all([
    context.request.get(`${mockApiUrl}/todos?organizationId=org-b`),
    context.request.get(`${mockApiUrl}/todos?organizationId=org-forbidden`),
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
  await page.goto("/organization/org-b/settings")
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
  await page.getByRole("button", { name: "View members" }).click()
  await expect(page).toHaveURL(/\/organization\/org-b\/members$/)
  await expect(
    page.getByRole("heading", { name: "Members", exact: true })
  ).toBeVisible()
  expect(invitationRequests).toEqual([])
})

test("member招待・role編集・削除とsession revokeを画面から完了できる", async ({
  context,
  page,
}) => {
  await useSession(context, "admin")
  await page.goto("/organization/org-a/members")

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

  await page.getByRole("button", { name: "Invite member" }).click()
  const inviteDialog = page.getByRole("dialog", { name: "Invite member" })
  await inviteDialog
    .getByRole("textbox", { name: "Email" })
    .fill("browser-e2e@example.com")
  const invitationResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/organizations/org-a/invitations") &&
      response.request().method() === "POST"
  )
  await inviteDialog.getByRole("button", { name: "Send invitation" }).click()
  expect((await invitationResponsePromise).status()).toBe(201)
  await expect(page.getByText("Invitation sent")).toBeVisible()
  await expect(
    page.getByText("browser-e2e@example.com", { exact: true })
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

test("mobile sidebarを閉じて別accountへ安全に切り替えられる", async ({
  context,
  page,
}) => {
  await useSession(context, "admin")
  await page.goto("/dashboard")
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
  await page.goto("/dashboard/todos")
  await expect(
    page.getByLabel("Due date for Review tenant audit log")
  ).toHaveValue("2026-07-21")
  await page
    .getByRole("button", { name: "Review tenant audit log", exact: true })
    .click()

  await expect(page.getByLabel("Due date", { exact: true })).toHaveValue(
    "2026-07-21"
  )
  await expect(
    page.getByText("Tenant boundary verified in the API integration suite.")
  ).toBeVisible()

  const title = page.getByLabel("Title")
  await title.clear()
  await title.fill("Review tenant audit evidence")
  const updateResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/todos/issue-a-1") &&
      response.request().method() === "PATCH"
  )
  await page.getByRole("button", { name: "Save changes" }).click()
  const issueUpdateResponse = await updateResponse
  expect(issueUpdateResponse.ok()).toBeTruthy()
  expect(issueUpdateResponse.request().postDataJSON()).toEqual(
    expect.objectContaining({ dueDate: "2026-07-21" })
  )
  await expect(
    page.getByText("Review tenant audit evidence").first()
  ).toBeVisible()

  await page.getByLabel("Add comment").fill("Verified from the browser journey")
  const createCommentResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/todos/issue-a-1/comments") &&
      response.request().method() === "POST"
  )
  await page.getByRole("button", { name: "Comment" }).click()
  expect((await createCommentResponse).status()).toBe(201)
  await expect(
    page.getByText("Verified from the browser journey")
  ).toBeVisible()

  let commentCard = page
    .getByText("Verified from the browser journey")
    .locator("..")
  await commentCard.getByRole("button", { name: "Edit" }).click()
  const editComment = page.getByLabel("Edit comment")
  await editComment.clear()
  await editComment.fill("Verified and documented from the browser journey")
  const updateCommentResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/todos/issue-a-1/comments/comment-admin-2") &&
      response.request().method() === "PATCH"
  )
  await page.getByRole("button", { name: "Save comment" }).click()
  expect((await updateCommentResponse).ok()).toBeTruthy()
  await expect(
    page.getByText("Verified and documented from the browser journey")
  ).toBeVisible()

  commentCard = page
    .getByText("Verified and documented from the browser journey")
    .locator("..")
  await commentCard.getByRole("button", { name: "Delete" }).click()
  const deleteCommentResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/todos/issue-a-1/comments/comment-admin-2") &&
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
      response.url().endsWith("/todos/issue-a-1") &&
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

  await page.goto("/organization/org-a/settings")
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
  expect(
    await (await context.request.get(`${mockApiUrl}/organizations`)).json()
  ).toEqual([expect.objectContaining({ id: "org-b", name: "Beta Support" })])
})

test("organization・member・invitation・session・一時faultを決定的に再現する", async ({
  context,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chrome",
    "mock API contractはbrowser engine非依存なのでdesktopで一度だけ検証する"
  )

  await useSession(context, "admin")

  const todosResponse = await context.request.get(
    `${mockApiUrl}/todos?organizationId=org-a`
  )
  expect(await todosResponse.json()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "issue-a-1",
        dueDate: "2026-07-21",
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
    { data: { email: "browser-e2e@example.com", role: "member" } }
  )
  expect(invitationResponse.status()).toBe(201)
  expect(await invitationResponse.json()).toEqual(
    expect.objectContaining({
      id: "invitation-admin-2",
      email: "browser-e2e@example.com",
      status: "pending",
    })
  )
  const cancelInvitationResponse = await context.request.delete(
    `${mockApiUrl}/organizations/org-a/invitations/invitation-admin-2`
  )
  expect(await cancelInvitationResponse.json()).toEqual({
    id: "invitation-admin-2",
    status: "cancelled",
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
    },
  })
  expect((await context.request.get(`${mockApiUrl}/me`)).ok()).toBeTruthy()
})
