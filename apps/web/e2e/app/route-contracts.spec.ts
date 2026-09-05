import type { BrowserContext, Page, Route } from "@playwright/test"

import { tanStackStartIntegrationEnvironment } from "./fixtures/environment"
import { expect, test } from "./fixtures/test"
import type { CreateRequestGate } from "./fixtures/test"

const mockApiUrl = tanStackStartIntegrationEnvironment.apiOrigin
const signedOAuthSearch =
  "response_type=code&client_id=client_1&redirect_uri=http%3A%2F%2F127.0.0.1%2Fcallback&exp=0001785726000&sig=signed-query&ba_param=client_id&ba_param=state"
const interceptedServerFunctionError =
  /^console\.error: Error: \[object Object\]\n\s+at Object\.deserialize \([^)]*\/assets\/createServerFn-[^)]+\)/u
const publicServerFunctionError = /The service is temporarily unavailable\./u
const serverFunctionPattern = "**/_serverFn/**"

type AllowClientErrors = (...patterns: RegExp[]) => void

const noop: () => void = () => undefined

type ConsoleRouteContract = {
  assertReady?: (page: Page) => Promise<void>
  faultCount?: number
  heading: string
  headingLevel?: number
  navigationLabel?: string
  navigate?: (page: Page) => Promise<void>
  requestPath: string
  route: string
  sourceRoute: string
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

const withBoundaryInvitation = (route: string, state: string) =>
  `${route}-${state}`

const createRequestFault = async (
  context: BrowserContext,
  requestPath: string,
  count = 1
) => {
  const responses = await Promise.all(
    Array.from({ length: count }, () =>
      context.request.post(`${mockApiUrl}/__e2e/faults`, {
        data: {
          path: requestPath,
          method: "GET",
          status: 503,
          code: "service_unavailable",
          message: "Injected route contract outage",
        },
      })
    )
  )
  for (const response of responses) {
    expect(response.status()).toBe(201)
  }
}

const navigateThroughBrowserHistory = async (page: Page, href: string) => {
  await page.evaluate((nextHref) => {
    window.history.pushState(window.history.state, "", nextHref)
  }, href)
}

const isDocsNavigationRequest = (route: Route) => {
  const request = route.request()
  const url = new URL(request.url())

  return (
    request.method() === "GET" &&
    request.headers()["x-tsr-serverfn"] === "true" &&
    url.pathname.startsWith("/_serverFn/") &&
    url.search.length === 0
  )
}

const expectConsoleShellReady = async (page: Page) => {
  await expect(
    page.locator('[data-console-shell][data-boundary-state="ready"]:visible')
  ).toBeVisible()
}

const expectReadyConsoleRoute = async (
  page: Page,
  heading: string,
  headingLevel?: number
) => {
  await expectConsoleShellReady(page)
  await expect(
    page.locator(
      '[data-route-boundary="true"][data-boundary-state="ready"]:visible'
    )
  ).toBeVisible()
  await expect(
    page.getByRole("heading", {
      name: heading,
      exact: true,
      level: headingLevel,
    })
  ).toBeVisible()
}

const navigateToContract = async (
  page: Page,
  contract: ConsoleRouteContract
) => {
  if (contract.navigate) {
    await contract.navigate(page)
    return
  }
  if (!contract.navigationLabel) {
    throw new Error(`Missing navigation for ${contract.route}`)
  }
  await page
    .getByRole("link", { name: contract.navigationLabel, exact: true })
    .click()
}

const openReadySourceRoute = async (
  page: Page,
  contract: ConsoleRouteContract
) => {
  await page.goto(contract.sourceRoute)
  await expectConsoleShellReady(page)
  await expect(
    page.locator(
      '[data-route-boundary="true"][data-boundary-state="ready"]:visible'
    )
  ).toBeVisible()
}

const verifyConsoleRouteContract = async ({
  allowClientErrors,
  context,
  createRequestGate,
  page,
  contract,
}: {
  allowClientErrors: AllowClientErrors
  context: BrowserContext
  createRequestGate: CreateRequestGate
  page: Page
  contract: ConsoleRouteContract
}) => {
  allowClientErrors(/Failed to load resource.*500/, publicServerFunctionError)
  await useSession(context, "admin")

  await openReadySourceRoute(page, contract)
  const requestGate = await createRequestGate(contract.requestPath)
  const loadingNavigation = navigateToContract(page, contract)
  try {
    await requestGate.waitUntilRequested()
    await expectConsoleShellReady(page)
    await expect(
      page.locator(
        '[data-route-boundary="true"][data-boundary-state="loading"]:visible'
      )
    ).toBeVisible()
  } finally {
    await requestGate.release()
  }
  await loadingNavigation
  await expectReadyConsoleRoute(page, contract.heading, contract.headingLevel)
  await contract.assertReady?.(page)
  await expect(page).toHaveURL(new RegExp(`${contract.route}$`, "u"))

  await openReadySourceRoute(page, contract)
  await createRequestFault(context, contract.requestPath, contract.faultCount)
  const errorNavigation = navigateToContract(page, contract)
  await expectConsoleShellReady(page)
  await expect(
    page.locator(
      '[data-route-boundary="true"][data-boundary-state="error"]:visible'
    )
  ).toBeVisible()
  await errorNavigation
  await page.getByRole("button", { name: "Try again" }).click()
  await expectReadyConsoleRoute(page, contract.heading, contract.headingLevel)
  await contract.assertReady?.(page)
  await expect(page).toHaveURL(new RegExp(`${contract.route}$`, "u"))
}

const verifyInvitationRouteContract = async ({
  allowClientErrors,
  context,
  createRequestGate,
  page,
  route,
}: {
  allowClientErrors: AllowClientErrors
  context: BrowserContext
  createRequestGate: CreateRequestGate
  page: Page
  route: string
}) => {
  allowClientErrors(/Failed to load resource.*500/, publicServerFunctionError)
  await useSession(context, "new-user")

  await page.goto(route)
  await expect(
    page.locator(
      '[data-route-boundary="true"][data-boundary-state="ready"]:visible'
    )
  ).toBeVisible()

  const requestGate = await createRequestGate("/auth/get-session")
  await navigateThroughBrowserHistory(
    page,
    withBoundaryInvitation(route, "loading")
  )
  try {
    await requestGate.waitUntilRequested()
    await expect(
      page.locator(
        '[data-route-boundary="true"][data-boundary-state="loading"]:visible'
      )
    ).toBeVisible()
  } finally {
    await requestGate.release()
  }
  await expect(
    page.locator(
      '[data-route-boundary="true"][data-boundary-state="ready"]:visible'
    )
  ).toBeVisible()

  await createRequestFault(context, "/auth/get-session")
  await navigateThroughBrowserHistory(
    page,
    withBoundaryInvitation(route, "error")
  )
  await expect(
    page.locator(
      '[data-route-boundary="true"][data-boundary-state="error"]:visible'
    )
  ).toBeVisible()
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(
    page.locator(
      '[data-route-boundary="true"][data-boundary-state="ready"]:visible'
    )
  ).toBeVisible()
}

test("認証routeは署名済みOAuth queryの文字列と重複値をそのまま引き継ぐ", async ({
  page,
}) => {
  // Given: 数値様文字列と重複値を含む署名済みOAuth queryを用意する
  const expectedRedirectTo = `/oauth/organization?${signedOAuthSearch}`

  // When: OAuth providerから認証routeを開く
  const response = await page.goto(`/auth/sign-in?${signedOAuthSearch}`)

  // Then: browser cacheへ保存せず、認証画面内の遷移先には元のqueryが保持される
  expect(response?.headers()["cache-control"]).toBe("no-store")
  const signUpHref = await page
    .getByRole("link", { name: "Sign Up", exact: true })
    .getAttribute("href")
  expect(signUpHref).not.toBeNull()
  expect(
    new URL(
      signUpHref ?? "/",
      tanStackStartIntegrationEnvironment.webOrigin
    ).searchParams.get("redirectTo")
  ).toBe(expectedRedirectTo)
})

test("旧招待URLはqueryを保持した307で正規URLへ移す", async ({ request }) => {
  // When: query付きの旧招待URLへ直接requestする
  const response = await request.get(
    "/organization/invitations/invitation-new-user?source=legacy&campaign=mail",
    { maxRedirects: 0 }
  )

  // Then: queryを保持した正規URLを307で返す
  expect(response.status()).toBe(307)
  expect(response.headers().location).toBe(
    "/invitations/invitation-new-user?source=legacy&campaign=mail"
  )
  expect(response.headers()["content-security-policy"]).toContain(
    "connect-src 'self'"
  )
  expect(response.headers()["referrer-policy"]).toBe("same-origin")
})

test("@route-contract /docs 親loaderはshell内の全境界状態から復帰する", async ({
  allowClientErrors,
  context,
  page,
}) => {
  // Given: consoleから公開docsへクライアント遷移できる
  allowClientErrors(
    /Injected docs navigation outage/u,
    /Failed to load resource.*503/u,
    interceptedServerFunctionError
  )
  await useSession(context, "admin")
  await page.goto("/organization/alpha-operations/dashboard")
  await expectReadyConsoleRoute(page, "Overview")

  let markNavigationRequested = noop
  let releaseNavigation = noop
  const navigationRequested = new Promise<void>((resolve) => {
    markNavigationRequested = resolve
  })
  const navigationReleased = new Promise<void>((resolve) => {
    releaseNavigation = resolve
  })
  const loadingHandler = async (route: Route) => {
    if (!isDocsNavigationRequest(route)) {
      await route.continue()
      return
    }

    markNavigationRequested()
    await navigationReleased
    await route.continue()
  }
  await page.route(serverFunctionPattern, loadingHandler)

  // When: docs親loaderのrequestを保留する
  const loadingNavigation = page
    .getByRole("link", { name: "Documentation", exact: true })
    .click()
  try {
    await navigationRequested

    // Then: docs shellを維持したloading境界を表示する
    await expect(
      page.locator('[data-docs-shell][data-boundary-state="loading"]:visible')
    ).toBeVisible()
    releaseNavigation()
    await loadingNavigation
    await expect(
      page.locator('[data-docs-shell][data-boundary-state="ready"]:visible')
    ).toBeVisible()
    await expect(page.locator("[data-docs-page]:visible")).toBeVisible()
  } finally {
    releaseNavigation()
    await page.unroute(serverFunctionPattern, loadingHandler)
  }

  // Given: 同じ親loaderが一度だけ失敗する
  await page.goto("/organization/alpha-operations/dashboard")
  await expectReadyConsoleRoute(page, "Overview")
  const faultHandler = async (route: Route) => {
    if (!isDocsNavigationRequest(route)) {
      await route.continue()
      return
    }

    await route.fulfill({
      body: "Injected docs navigation outage",
      contentType: "text/plain",
      status: 503,
    })
  }
  await page.route(serverFunctionPattern, faultHandler)

  // When: docsへ遷移する
  await page.getByRole("link", { name: "Documentation", exact: true }).click()
  try {
    // Then: docs shellを維持したerror境界を表示する
    await expect(
      page.locator('[data-docs-shell][data-boundary-state="error"]:visible')
    ).toBeVisible()
    await expect(
      page.getByRole("heading", {
        name: "Documentation could not be loaded",
        exact: true,
      })
    ).toBeVisible()
  } finally {
    await page.unroute(serverFunctionPattern, faultHandler)
  }

  // When: 障害を解除してretryする
  await page.getByRole("button", { name: "Try again", exact: true }).click()

  // Then: readyなdocs shellへ復帰する
  await expect(
    page.locator('[data-docs-shell][data-boundary-state="ready"]:visible')
  ).toBeVisible()
  await expect(page.locator("[data-docs-page]:visible")).toBeVisible()
  await expect(page).toHaveURL(/\/docs$/u)
})

test("@route-contract /organization/[organizationSlug]/dashboard は全境界状態から復帰する", async ({
  allowClientErrors,
  context,
  createRequestGate,
  page,
}) => {
  await verifyConsoleRouteContract({
    allowClientErrors,
    context,
    createRequestGate,
    page,
    contract: {
      heading: "Overview",
      navigationLabel: "Overview",
      requestPath: "/issues",
      route: "/organization/alpha-operations/dashboard",
      sourceRoute: "/organization/alpha-operations/members",
    },
  })
})

test("@route-contract /organization/[organizationSlug]/issues は全境界状態から復帰する", async ({
  allowClientErrors,
  context,
  createRequestGate,
  page,
}) => {
  await verifyConsoleRouteContract({
    allowClientErrors,
    context,
    createRequestGate,
    page,
    contract: {
      faultCount: 2,
      heading: "Issues",
      navigationLabel: "Issues",
      requestPath: "/me",
      route: "/organization/alpha-operations/issues",
      sourceRoute: "/organization/alpha-operations/members",
    },
  })
})

test("@route-contract Agentペインは同じ組織内のクライアント遷移後も開いた状態を維持する", async ({
  context,
  page,
}) => {
  await useSession(context, "admin")
  await page.goto("/organization/alpha-operations/dashboard")
  await expectReadyConsoleRoute(page, "Overview")

  await page.getByRole("button", { name: "Open Agent" }).click()
  const agentPane = page.getByRole("complementary", { name: "Agent" })
  await expect(agentPane).toBeVisible()

  await page.getByRole("link", { name: "Issues", exact: true }).click()

  await expect(page).toHaveURL("/organization/alpha-operations/issues")
  await expectReadyConsoleRoute(page, "Issues")
  await expect(agentPane).toBeVisible()
})

test("@route-contract /organization/[organizationSlug]/issues/[issueNumber] は全境界状態から復帰する", async ({
  allowClientErrors,
  context,
  createRequestGate,
  page,
}) => {
  await verifyConsoleRouteContract({
    allowClientErrors,
    context,
    createRequestGate,
    page,
    contract: {
      assertReady: async (currentPage) => {
        await expect(currentPage.getByRole("dialog")).toHaveCount(0)
        await expect(
          currentPage.getByRole("button", {
            name: "Back to issues",
            exact: true,
          })
        ).toBeVisible()
      },
      heading: "Review tenant audit log",
      headingLevel: 1,
      navigate: async (currentPage) => {
        await currentPage
          .getByRole("link", {
            name: "Review tenant audit log",
            exact: true,
          })
          .first()
          .click()
      },
      requestPath: "/issues/by-number/1",
      route: "/organization/alpha-operations/issues/1",
      sourceRoute: "/organization/alpha-operations/issues",
    },
  })
})

test("Issue一覧へ戻るとURLと文書スクロールをブラウザー履歴から復元する", async ({
  context,
  page,
}) => {
  await useSession(context, "admin")
  const listRoute =
    "/organization/alpha-operations/issues?status=open&page=2&agentThread=scroll-state"

  await page.goto(listRoute)
  await expectReadyConsoleRoute(page, "Issues")
  await page.addStyleTag({
    content: `
      section[aria-label="Issues"] {
        min-height: 1800px;
        padding-top: 600px;
      }
    `,
  })

  await page.evaluate(() => window.scrollTo({ top: 520 }))
  const issueLink = page
    .getByRole("link", {
      name: "Review tenant audit log",
      exact: true,
    })
    .first()
  await expect(issueLink).toBeVisible()
  await issueLink.scrollIntoViewIfNeeded()
  const listScrollY = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        requestAnimationFrame(() => resolve(window.scrollY))
      })
  )
  const issueRowHeight = await issueLink.evaluate(
    (link) => link.closest("tr")?.getBoundingClientRect().height ?? 0
  )
  expect(listScrollY).toBeGreaterThan(0)
  expect(issueRowHeight).toBeGreaterThan(0)

  await issueLink.click()
  await expect(page).toHaveURL(
    "/organization/alpha-operations/issues/1?agentThread=scroll-state"
  )
  await expectReadyConsoleRoute(page, "Review tenant audit log", 1)
  await page
    .getByRole("button", { name: "Back to issues", exact: true })
    .click()
  await expect(page).toHaveURL(listRoute)
  await expectReadyConsoleRoute(page, "Issues")
  const restoredIssueLink = page
    .getByRole("link", {
      name: "Review tenant audit log",
      exact: true,
    })
    .first()
  await expect(restoredIssueLink).toBeVisible()
  await expect
    .poll(async () =>
      Math.abs((await page.evaluate(() => window.scrollY)) - listScrollY)
    )
    .toBeLessThan(issueRowHeight)
})

test("Issue詳細へ直接アクセスすると戻る操作はIssue一覧へ遷移する", async ({
  context,
  page,
}) => {
  await useSession(context, "admin")
  await page.goto("/organization/alpha-operations/issues/1")
  await expectReadyConsoleRoute(page, "Review tenant audit log", 1)
  await page
    .getByRole("button", { name: "Back to issues", exact: true })
    .click()
  await expect(page).toHaveURL("/organization/alpha-operations/issues")
})

test("@route-contract /organization/[organizationSlug]/members は全境界状態から復帰する", async ({
  allowClientErrors,
  context,
  createRequestGate,
  page,
}) => {
  await verifyConsoleRouteContract({
    allowClientErrors,
    context,
    createRequestGate,
    page,
    contract: {
      heading: "Members",
      navigationLabel: "Members",
      requestPath: "/organizations/org-a",
      route: "/organization/alpha-operations/members",
      sourceRoute: "/settings/account",
    },
  })
})

test("@route-contract /organization/[organizationSlug]/settings は全境界状態から復帰する", async ({
  allowClientErrors,
  context,
  createRequestGate,
  page,
}) => {
  await verifyConsoleRouteContract({
    allowClientErrors,
    context,
    createRequestGate,
    page,
    contract: {
      heading: "Organization settings",
      navigationLabel: "Organization settings",
      requestPath: "/organizations/org-a",
      route: "/organization/alpha-operations/settings",
      sourceRoute: "/organization/alpha-operations/members",
    },
  })
})

test("@route-contract /settings/account は全境界状態から復帰する", async ({
  allowClientErrors,
  context,
  createRequestGate,
  page,
}) => {
  await verifyConsoleRouteContract({
    allowClientErrors,
    context,
    createRequestGate,
    page,
    contract: {
      faultCount: 2,
      heading: "Account settings",
      navigationLabel: "Account",
      requestPath: "/me",
      route: "/settings/account",
      sourceRoute: "/organization/alpha-operations/members",
    },
  })
})

test("@route-contract /settings/organizations は全境界状態から復帰する", async ({
  allowClientErrors,
  context,
  createRequestGate,
  page,
}) => {
  await verifyConsoleRouteContract({
    allowClientErrors,
    context,
    createRequestGate,
    page,
    contract: {
      faultCount: 2,
      heading: "Organizations",
      navigationLabel: "Organizations",
      requestPath: "/me",
      route: "/settings/organizations",
      sourceRoute: "/organization/alpha-operations/members",
    },
  })
})

test("@route-contract /invitations/[invitationId] は全境界状態から復帰する", async ({
  allowClientErrors,
  context,
  createRequestGate,
  page,
}) => {
  await verifyInvitationRouteContract({
    allowClientErrors,
    context,
    createRequestGate,
    page,
    route: "/invitations/invitation-new-user",
  })
})
