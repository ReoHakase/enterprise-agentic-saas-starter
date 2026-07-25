import type { BrowserContext, Page } from "@playwright/test"

import { expect, test } from "./fixtures/test"

const mockApiUrl = "http://127.0.0.1:3001"

type AllowClientErrors = (...patterns: RegExp[]) => void

type ConsoleRouteContract = {
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

const createRequestDelay = async (
  context: BrowserContext,
  requestPath: string
) => {
  const response = await context.request.post(
    `${mockApiUrl}/__e2e/request-delays`,
    { data: { path: requestPath, method: "GET", delayMs: 2_000 } }
  )
  expect(response.status()).toBe(201)
}

const createRequestFault = async (
  context: BrowserContext,
  requestPath: string
) => {
  const response = await context.request.post(`${mockApiUrl}/__e2e/faults`, {
    data: {
      path: requestPath,
      method: "GET",
      status: 503,
      code: "dependency_unavailable",
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
  page,
  contract,
}: {
  allowClientErrors: AllowClientErrors
  context: BrowserContext
  page: Page
  contract: ConsoleRouteContract
}) => {
  allowClientErrors(
    /Injected route contract outage/,
    /Failed to load resource.*503/
  )
  await useSession(context, "admin")

  await openReadySourceRoute(page, contract)
  await createRequestDelay(context, contract.requestPath)
  const loadingNavigation = navigateToContract(page, contract)
  await expectConsoleShellReady(page)
  await expect(
    page.locator(
      '[data-route-boundary="true"][data-boundary-state="loading"]:visible'
    )
  ).toBeVisible()
  await loadingNavigation
  await expectReadyConsoleRoute(page, contract.heading, contract.headingLevel)
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
  await expect(page).toHaveURL(new RegExp(`${contract.route}$`, "u"))
}

const verifyInvitationRouteContract = async ({
  allowClientErrors,
  context,
  page,
  route,
}: {
  allowClientErrors: AllowClientErrors
  context: BrowserContext
  page: Page
  route: string
}) => {
  allowClientErrors(
    /Injected route contract outage/,
    /Session request failed with status 503/,
    /Failed to load resource.*503/
  )
  await useSession(context, "new-user")

  await page.goto(route)
  await expect(
    page.locator(
      '[data-route-boundary="true"][data-boundary-state="ready"]:visible'
    )
  ).toBeVisible()

  await page.goto("about:blank")
  await createRequestDelay(context, "/auth/get-session")
  const loadingNavigation = page.goto(withBoundaryQuery(route, "loading"))
  await expect(
    page.locator(
      '[data-route-boundary="true"][data-boundary-state="loading"]:visible'
    )
  ).toBeVisible()
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

test("@route-contract /organization/[organizationSlug]/agent は全boundary stateから復帰する", async ({
  allowClientErrors,
  context,
  page,
}) => {
  await verifyConsoleRouteContract({
    allowClientErrors,
    context,
    page,
    contract: {
      heading: "Agent",
      headingLevel: 1,
      navigationLabel: "Agent",
      requestPath: "/me",
      route: "/organization/alpha-operations/agent",
      sourceRoute: "/organization/alpha-operations/members",
    },
  })
})

test("@route-contract /organization/[organizationSlug]/dashboard は全boundary stateから復帰する", async ({
  allowClientErrors,
  context,
  page,
}) => {
  await verifyConsoleRouteContract({
    allowClientErrors,
    context,
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
  page,
}) => {
  await verifyConsoleRouteContract({
    allowClientErrors,
    context,
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

test("@route-contract /organization/[organizationSlug]/issues/[issueNumber] は全boundary stateから復帰する", async ({
  allowClientErrors,
  context,
  page,
}) => {
  await verifyConsoleRouteContract({
    allowClientErrors,
    context,
    page,
    contract: {
      heading: "Review tenant audit log",
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

test("@route-contract /organization/[organizationSlug]/members は全boundary stateから復帰する", async ({
  allowClientErrors,
  context,
  page,
}) => {
  await verifyConsoleRouteContract({
    allowClientErrors,
    context,
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
  page,
}) => {
  await verifyConsoleRouteContract({
    allowClientErrors,
    context,
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
  page,
}) => {
  await verifyConsoleRouteContract({
    allowClientErrors,
    context,
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
  page,
}) => {
  await verifyConsoleRouteContract({
    allowClientErrors,
    context,
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
  page,
}) => {
  await verifyInvitationRouteContract({
    allowClientErrors,
    context,
    page,
    route: "/invitations/invitation-new-user",
  })
})
