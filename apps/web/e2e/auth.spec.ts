import { expect, test, type BrowserContext } from "@playwright/test"

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
  await expect(email).toHaveValue("")

  // Email delivery itself is covered at the package boundary. The E2E harness
  // models opening the one-time link by installing the resulting session.
  await useSession(context, "new-user")
  await page.goto("/settings/organizations")

  await expect(page.getByText("No organizations yet")).toBeVisible()
  await page.getByLabel("Name").fill("Acme Operations")
  await expect(page.getByLabel("Slug")).toHaveValue("acme-operations")
  await page.getByRole("button", { name: "Create organization" }).click()

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
  await expect(page.getByText("Document tenant switch runbook")).toBeVisible()

  await page.getByRole("button", { name: /alpha operations/i }).click()
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
  await page.getByRole("button", { name: /choose organization/i }).click()

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

  const denied = await page.evaluate(async (baseUrl) => {
    const [roleResponse, tenantResponse] = await Promise.all([
      fetch(`${baseUrl}/organizations/org-b`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Escalated" }),
      }),
      fetch(`${baseUrl}/todos?organizationId=org-forbidden`, {
        credentials: "include",
      }),
    ])

    return {
      roleStatus: roleResponse.status,
      tenantStatus: tenantResponse.status,
    }
  }, mockApiUrl)

  expect(denied).toEqual({ roleStatus: 403, tenantStatus: 403 })

  await page.goto("/organization/org-b/settings")
  await expect(page).toHaveURL(/\/organization\/org-b\/members$/)
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible()
})
