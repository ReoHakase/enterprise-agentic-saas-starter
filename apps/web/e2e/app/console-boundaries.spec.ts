import type { BrowserContext, Page } from "@playwright/test"

import { nextjsIntegrationEnvironment } from "./fixtures/environment"
import {
  expect,
  productionServerComponentRenderError,
  test,
} from "./fixtures/test"

const mockApiUrl = nextjsIntegrationEnvironment.apiOrigin

const useAdminSession = async (context: BrowserContext) => {
  await context.addCookies([
    {
      name: "e2e-session",
      value: "admin",
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ])
}

const navigateFromConsoleSidebar = async (page: Page, label: string) => {
  if ((page.viewportSize()?.width ?? 0) < 768) {
    await page.getByRole("button", { name: "Toggle Sidebar" }).click()
  }
  await page
    .getByRole("link", { name: label, exact: true })
    .click({ noWaitAfter: true })
}

test("コンソールのサイドバーから公開ドキュメントへ遷移する", async ({
  context,
  page,
}) => {
  await useAdminSession(context)
  await page.goto("/dashboard")

  const documentationLink = page.getByRole("link", {
    name: "Documentation",
    exact: true,
  })
  await expect(documentationLink).toHaveAttribute("href", "/docs")
  await documentationLink.click()

  await expect(page).toHaveURL(/\/docs$/u)
  await expect(page.locator("[data-console-shell]")).toHaveCount(0)
})

test("コンソールの読み込み状態から実画面へ復帰する", async ({
  context,
  createRequestGate,
  page,
}) => {
  await useAdminSession(context)
  const requestGate = await createRequestGate("/me")

  const navigation = page.goto("/dashboard?boundary-state=loading")
  try {
    await requestGate.waitUntilRequested()
    await expect(
      page.locator('[data-console-shell][data-boundary-state="loading"]')
    ).toBeVisible()
  } finally {
    await requestGate.release()
  }

  await navigation
  await expect(
    page.getByRole("heading", { name: "Overview", level: 1 })
  ).toBeVisible()
  await expect(
    page.locator('[data-console-shell][data-boundary-state="ready"]')
  ).toBeVisible()
})

test("Issueへの遷移中に読み込み状態を経て対象routeへ復帰する", async ({
  context,
  createRequestGate,
  page,
}) => {
  await useAdminSession(context)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/dashboard")
  await expect(
    page.getByRole("heading", { name: "Overview", level: 1 })
  ).toBeVisible()
  const requestGate = await createRequestGate("/issues")

  await navigateFromConsoleSidebar(page, "Issues")
  try {
    await requestGate.waitUntilRequested()
    await expect(
      page.getByRole("status", { name: "Loading organization issues" })
    ).toBeVisible()
  } finally {
    await requestGate.release()
  }

  await expect(
    page.getByRole("heading", { name: "Issues", level: 1 })
  ).toBeVisible()
  await expect(page).toHaveURL(/\/organization\/alpha-operations\/issues$/u)
})

test("コンソールのError Boundaryを再試行して復帰する", async ({
  allowClientErrors,
  context,
  page,
}) => {
  allowClientErrors(
    /Injected console boundary outage/,
    /Failed to load resource.*503/,
    productionServerComponentRenderError
  )
  await useAdminSession(context)
  const faultResponse = await context.request.post(
    `${mockApiUrl}/__e2e/faults`,
    {
      data: {
        path: "/me",
        method: "GET",
        status: 503,
        code: "service_unavailable",
        message: "Injected console boundary outage",
      },
    }
  )
  expect(faultResponse.status()).toBe(201)

  await page.goto("/dashboard?boundary-state=error")
  await expect(
    page.locator('[data-console-shell][data-boundary-state="error"]')
  ).toBeVisible()
  await page.getByRole("button", { name: "Try again" }).click()

  await expect(
    page.getByRole("heading", { name: "Overview", level: 1 })
  ).toBeVisible()
  await expect(
    page.locator('[data-console-shell][data-boundary-state="ready"]')
  ).toBeVisible()
})
