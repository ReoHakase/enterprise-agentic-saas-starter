import type { BrowserContext, Page } from "@playwright/test"

import { tanStackStartIntegrationEnvironment } from "./fixtures/environment"
import { expect, test } from "./fixtures/test"

const mockApiUrl = tanStackStartIntegrationEnvironment.apiOrigin
const privateServerFunctionError = "client_secret=browser-private-sentinel"

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

const openDocsThroughConsoleNavigation = async (
  context: BrowserContext,
  page: Page
) => {
  await useAdminSession(context)
  await page.goto("/dashboard")
  await expect(
    page.getByRole("heading", { name: "Overview", level: 1 })
  ).toBeVisible()
  await page.getByRole("link", { name: "Documentation", exact: true }).click()
  await expect(page).toHaveURL(/\/docs$/u)
  await expect(
    page.locator('[data-docs-shell][data-boundary-state="ready"]')
  ).toBeVisible()
}

const openHydratedDocs = async (context: BrowserContext, page: Page) => {
  await useAdminSession(context)
  await page.goto("/docs")
  await page
    .getByRole("button", { name: "Search Documentation", exact: true })
    .click()
  const searchInput = page.getByRole("combobox", {
    name: "Search Documentation",
    exact: true,
  })
  await expect(searchInput).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(searchInput).toBeHidden()
}

test("コンソールのサイドバーから公開ドキュメントへ遷移する", async ({
  context,
  page,
}) => {
  // Given: 認証済みconsoleを表示する
  await openDocsThroughConsoleNavigation(context, page)

  // Then: Documentationリンクのclient navigationでpublic routeだけを表示する
  await expect(page).toHaveURL(/\/docs$/u)
  await expect(page.locator("[data-console-shell]")).toHaveCount(0)
})

test("コンソールの読み込み状態から実画面へ復帰する", async ({
  context,
  createRequestGate,
  page,
}) => {
  // Given: 認証済みのbrowserをpublic routeで起動し、親console loaderを待機させる
  await openHydratedDocs(context, page)
  const requestGate = await createRequestGate("/me")

  // When: DocumentationのOpen Appリンクでconsole routeへ移る
  await page.getByRole("link", { name: "Open App", exact: true }).click()
  try {
    await requestGate.waitUntilRequested()

    // Then: 親loaderの完了前はconsole shellのpendingComponentを表示する
    await expect(
      page.locator('[data-console-shell][data-boundary-state="loading"]')
    ).toBeVisible()
  } finally {
    await requestGate.release()
  }

  // Then: loader完了後は正規dashboardへ解決してready shellを表示する
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
  e2eNamespace,
  page,
}) => {
  // Given: 認証済みのbrowserをpublic routeで起動し、親console loaderの通常retryまで失敗させる
  allowClientErrors(
    /Failed to load resource.*500/,
    /The service is temporarily unavailable\./
  )
  const browserErrors: string[] = []
  const serverFunctionBodies: Array<Promise<string>> = []
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text())
  })
  page.on("response", (response) => {
    const url = new URL(response.url())
    if (response.status() === 500 && url.pathname.startsWith("/_serverFn/"))
      serverFunctionBodies.push(response.text())
  })
  await openHydratedDocs(context, page)
  const faultResponses = await Promise.all(
    Array.from({ length: 2 }, () =>
      context.request.post(`${mockApiUrl}/__e2e/faults`, {
        data: {
          path: "/me",
          method: "GET",
          status: 503,
          code: "service_unavailable",
          message: privateServerFunctionError,
        },
        headers: { "x-e2e-namespace": e2eNamespace },
      })
    )
  )
  for (const response of faultResponses) expect(response.status()).toBe(201)

  // When: DocumentationのOpen Appリンクでconsole routeへ移る
  await page.getByRole("link", { name: "Open App", exact: true }).click()

  // Then: 親routeのerrorComponentを表示し、再試行でready shellへ復帰する
  await expect(
    page.locator('[data-console-shell][data-boundary-state="error"]')
  ).toBeVisible()
  await expect.poll(() => serverFunctionBodies.length).toBeGreaterThan(0)
  const serializedFailures = (await Promise.all(serverFunctionBodies)).join(
    "\n"
  )
  expect(serializedFailures).toContain(
    "The service is temporarily unavailable."
  )
  expect(serializedFailures).not.toContain(privateServerFunctionError)
  expect(browserErrors.join("\n")).toContain(
    "The service is temporarily unavailable."
  )
  expect(browserErrors.join("\n")).not.toContain(privateServerFunctionError)
  const remainingFaults = await context.request.get(
    `${mockApiUrl}/__e2e/faults`,
    { headers: { "x-e2e-namespace": e2eNamespace } }
  )
  expect(remainingFaults.ok()).toBeTruthy()
  expect(await remainingFaults.json()).toEqual([])
  await page.getByRole("button", { name: "Try again" }).click()

  await expect(
    page.getByRole("heading", { name: "Overview", level: 1 })
  ).toBeVisible()
  await expect(
    page.locator('[data-console-shell][data-boundary-state="ready"]')
  ).toBeVisible()
})
