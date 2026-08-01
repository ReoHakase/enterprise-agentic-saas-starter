import type { BrowserContext, Page } from "@playwright/test"

import { w6Environment } from "./fixtures/environment"
import {
  expect,
  productionServerComponentRenderError,
  test,
} from "./fixtures/test"
import type { CreateRequestGate } from "./fixtures/test"

const mockApiUrl = w6Environment.apiOrigin

type AllowClientErrors = (...patterns: RegExp[]) => void

type ConsoleRouteContract = {
  assertReady?: (page: Page) => Promise<void>
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

const withBoundaryQuery = (route: string, state: string) =>
  `${route}${route.includes("?") ? "&" : "?"}route-contract=${state}`

const createRequestFault = async (
  context: BrowserContext,
  requestPath: string
) => {
  const response = await context.request.post(`${mockApiUrl}/__e2e/faults`, {
    data: {
      path: requestPath,
      method: "GET",
      status: 503,
      code: "service_unavailable",
      message: "Injected route contract outage",
    },
  })
  expect(response.status()).toBe(201)
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

const blockRoutePrefetches = async (page: Page) => {
  await page.route("**/*", async (route) => {
    const headers = route.request().headers()
    if (
      headers["next-router-prefetch"] === "1" ||
      headers.purpose === "prefetch"
    ) {
      await route.abort()
      return
    }
    await route.continue()
  })
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
  allowClientErrors(
    /Injected route contract outage/,
    /Failed to load resource.*503/,
    /Failed to load resource: net::ERR_FAILED .*\?_rsc=/,
    productionServerComponentRenderError
  )
  await useSession(context, "admin")
  await blockRoutePrefetches(page)

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
  await createRequestFault(context, contract.requestPath)
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
  allowClientErrors(
    /Injected route contract outage/,
    /Session request failed with status 503/,
    /Failed to load resource.*503/,
    productionServerComponentRenderError
  )
  await useSession(context, "new-user")

  await page.goto(route)
  await expect(
    page.locator(
      '[data-route-boundary="true"][data-boundary-state="ready"]:visible'
    )
  ).toBeVisible()

  await page.goto("about:blank")
  const requestGate = await createRequestGate("/auth/get-session")
  const loadingNavigation = page.goto(withBoundaryQuery(route, "loading"))
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
  await loadingNavigation
  await expect(
    page.locator(
      '[data-route-boundary="true"][data-boundary-state="ready"]:visible'
    )
  ).toBeVisible()

  await page.goto("about:blank")
  await createRequestFault(context, "/auth/get-session")
  await page.goto(withBoundaryQuery(route, "error"))
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

test("@route-contract /organization/[organizationSlug]/dashboard は全boundary stateから復帰する", async ({
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

test("@route-contract /organization/[organizationSlug]/issues は全boundary stateから復帰する", async ({
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
      heading: "Issues",
      navigationLabel: "Issues",
      requestPath: "/me",
      route: "/organization/alpha-operations/issues",
      sourceRoute: "/organization/alpha-operations/members",
    },
  })
})

test("@route-contract Agent paneは同一organizationのclient navigation後も開いた状態を維持する", async ({
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

test("@route-contract /organization/[organizationSlug]/issues/[issueNumber] は全boundary stateから復帰する", async ({
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

test("Issue一覧へ戻るとURLとdocument scrollをbrowser historyから復元する", async ({
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
  const headerExtension = await page
    .locator('[data-slot="console-header"]')
    .evaluate((header) => {
      const headerStyle = getComputedStyle(header)
      const extensionStyle = getComputedStyle(header, "::before")

      return {
        backdropFilter: extensionStyle.backdropFilter,
        backgroundColor: extensionStyle.backgroundColor,
        headerBackdropFilter: headerStyle.backdropFilter,
        headerBackgroundColor: headerStyle.backgroundColor,
        headerTop: header.getBoundingClientRect().top,
        height: extensionStyle.height,
        top: extensionStyle.top,
      }
    })
  expect(headerExtension.headerTop).toBe(8)
  expect(headerExtension.top).toBe("-8px")
  expect(headerExtension.height).toBe("8px")
  expect(headerExtension.backgroundColor).toBe(
    headerExtension.headerBackgroundColor
  )
  expect(headerExtension.backdropFilter).toBe(
    headerExtension.headerBackdropFilter
  )

  const issueLink = page
    .getByRole("link", {
      name: "Review tenant audit log",
      exact: true,
    })
    .first()
  await expect(issueLink).toBeVisible()
  await issueLink.scrollIntoViewIfNeeded()
  const listScrollY = await page.evaluate(() => window.scrollY)
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
  await page.getByLabel("Add comment").fill("Unsaved navigation probe")

  await page
    .getByRole("button", { name: "Back to issues", exact: true })
    .click()
  await expect(
    page.getByRole("alertdialog", { name: "Discard unsaved changes?" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Discard changes" }).click()
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

  await page.goto("/organization/alpha-operations/issues/1")
  await expectReadyConsoleRoute(page, "Review tenant audit log", 1)
  await page
    .getByRole("button", { name: "Back to issues", exact: true })
    .click()
  await expect(page).toHaveURL("/organization/alpha-operations/issues")
})

test("@route-contract /organization/[organizationSlug]/members は全boundary stateから復帰する", async ({
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
      requestPath: "/organizations",
      route: "/organization/alpha-operations/members",
      sourceRoute: "/settings/account",
    },
  })
})

test("@route-contract /organization/[organizationSlug]/settings は全boundary stateから復帰する", async ({
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
      requestPath: "/organizations",
      route: "/organization/alpha-operations/settings",
      sourceRoute: "/organization/alpha-operations/members",
    },
  })
})

test("@route-contract /settings/account は全boundary stateから復帰する", async ({
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
      heading: "Account settings",
      navigationLabel: "Account",
      requestPath: "/me",
      route: "/settings/account",
      sourceRoute: "/organization/alpha-operations/members",
    },
  })
})

test("@route-contract /settings/organizations は全boundary stateから復帰する", async ({
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
      heading: "Organizations",
      navigationLabel: "Organizations",
      requestPath: "/me",
      route: "/settings/organizations",
      sourceRoute: "/organization/alpha-operations/members",
    },
  })
})

test("@route-contract /invitations/[invitationId] は全boundary stateから復帰する", async ({
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
