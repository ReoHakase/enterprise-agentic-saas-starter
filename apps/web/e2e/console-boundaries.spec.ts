import type { BrowserContext, Locator, Page } from "@playwright/test"

import {
  expect,
  productionServerComponentRenderError,
  test,
} from "./fixtures/test"

const mockApiUrl = "http://127.0.0.1:3001"
const geometryTolerance = 1
const allDimensions: GeometryDimension[] = ["x", "y", "width", "height"]
const frameDimensions: GeometryDimension[] = ["x", "y", "width"]

type GeometryDimension = "height" | "width" | "x" | "y"

type ElementGeometry = Record<GeometryDimension, number>

type ConsoleShellGeometry = {
  content: ElementGeometry
  header: ElementGeometry
  inset: ElementGeometry
  pageBody: ElementGeometry
  pageHeader: ElementGeometry
  scrollRegion: ElementGeometry
  sidebarContainer: ElementGeometry | null
}

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
    await expect(page.getByRole("dialog", { name: "Sidebar" })).toBeVisible()
  }
  await page
    .getByRole("link", { name: label, exact: true })
    .click({ noWaitAfter: true })
}

const requireGeometry = async (
  locator: Locator,
  label: string
): Promise<ElementGeometry> => {
  await expect(
    locator,
    `${label} should have one stable layout target`
  ).toHaveCount(1)
  await expect(locator, `${label} should be visible`).toBeVisible()

  let geometry: ElementGeometry | undefined
  await expect
    .poll(
      async () => {
        geometry = await locator
          .evaluate((element) => {
            const { height, width, x, y } = element.getBoundingClientRect()
            return width > 0 && height > 0 ? { height, width, x, y } : undefined
          })
          .catch(() => undefined)
        return geometry
      },
      { message: `${label} should have a measurable box` }
    )
    .toBeDefined()

  if (!geometry) {
    throw new Error(`${label} did not expose a measurable box`)
  }

  return geometry
}

const readConsoleShellGeometry = async (
  page: Page
): Promise<ConsoleShellGeometry> => {
  const shell = page.locator("[data-console-shell]:visible")
  await expect(shell).toHaveCount(1)
  await expect(shell).toBeVisible()

  const desktop = (page.viewportSize()?.width ?? 0) >= 768
  const sidebarContainer = shell.locator('[data-slot="sidebar-container"]')

  if (!desktop) {
    await expect(sidebarContainer).toHaveCount(0)
  }

  return {
    content: await requireGeometry(
      shell.locator('[data-slot="console-content"]'),
      "console content"
    ),
    header: await requireGeometry(
      shell.locator('[data-slot="console-header"]'),
      "console header"
    ),
    inset: await requireGeometry(
      shell.locator('[data-slot="sidebar-inset"]'),
      "sidebar inset"
    ),
    pageBody: await requireGeometry(
      shell.locator('[data-slot="page-body"]'),
      "page shell body"
    ),
    pageHeader: await requireGeometry(
      shell.locator('[data-slot="page-header"]'),
      "page shell header"
    ),
    scrollRegion: await requireGeometry(
      shell.locator('[data-slot="console-scroll-region"]'),
      "console scroll region"
    ),
    sidebarContainer: desktop
      ? await requireGeometry(sidebarContainer, "sidebar container")
      : null,
  }
}

const expectDimensionsToMatch = (
  actual: ElementGeometry,
  expected: ElementGeometry,
  label: string,
  dimensions: GeometryDimension[]
) => {
  for (const dimension of dimensions) {
    expect(
      Math.abs(actual[dimension] - expected[dimension]),
      `${label}.${dimension} should remain stable`
    ).toBeLessThanOrEqual(geometryTolerance)
  }
}

const expectConsoleFrameGeometryToMatch = (
  actual: ConsoleShellGeometry,
  expected: ConsoleShellGeometry,
  state: string
) => {
  expectDimensionsToMatch(
    actual.inset,
    expected.inset,
    `${state} inset`,
    allDimensions
  )
  expectDimensionsToMatch(
    actual.header,
    expected.header,
    `${state} header`,
    allDimensions
  )
  expectDimensionsToMatch(
    actual.scrollRegion,
    expected.scrollRegion,
    `${state} scroll region`,
    allDimensions
  )
  expectDimensionsToMatch(
    actual.content,
    expected.content,
    `${state} content`,
    frameDimensions
  )
  expect(actual.sidebarContainer === null).toBe(
    expected.sidebarContainer === null
  )
  if (actual.sidebarContainer && expected.sidebarContainer) {
    expectDimensionsToMatch(
      actual.sidebarContainer,
      expected.sidebarContainer,
      `${state} sidebar container`,
      allDimensions
    )
  }
}

const expectPageGeometryToMatch = (
  actual: ConsoleShellGeometry,
  expected: ConsoleShellGeometry,
  state: string,
  headerDimensions: GeometryDimension[] = allDimensions,
  bodyDimensions: GeometryDimension[] = frameDimensions
) => {
  expectDimensionsToMatch(
    actual.pageHeader,
    expected.pageHeader,
    `${state} page header`,
    headerDimensions
  )
  expectDimensionsToMatch(
    actual.pageBody,
    expected.pageBody,
    `${state} page body`,
    bodyDimensions
  )
}

const expectShellGeometryToMatch = (
  actual: ConsoleShellGeometry,
  expected: ConsoleShellGeometry,
  state: string
) => {
  expectConsoleFrameGeometryToMatch(actual, expected, state)
  expectPageGeometryToMatch(actual, expected, state)
}

const expectShellContract = async (
  page: Page,
  geometry: ConsoleShellGeometry
) => {
  const viewport = page.viewportSize()
  expect(viewport, "the project should define a viewport").not.toBeNull()
  if (!viewport) return

  const desktop = viewport.width >= 768
  const expectedInset = desktop
    ? {
        x: 256,
        y: 8,
        width: viewport.width - 264,
        height: viewport.height - 16,
      }
    : { x: 0, y: 0, width: viewport.width, height: viewport.height }

  expectDimensionsToMatch(
    geometry.inset,
    expectedInset,
    "shell inset contract",
    ["x", "y", "width", "height"]
  )
  expect(geometry.header.height).toBe(56)
  expect(geometry.scrollRegion.y).toBe(geometry.inset.y + 56)
  expect(geometry.scrollRegion.height).toBe(geometry.inset.height - 56)
  expect(
    geometry.pageBody.y - geometry.pageHeader.y - geometry.pageHeader.height
  ).toBe(24)

  if (desktop) {
    expect(geometry.sidebarContainer?.width).toBe(256)
  }

  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }))
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport)
  expect(overflow.body).toBeLessThanOrEqual(overflow.viewport)
}

const readLoadedDashboardGeometry = async (page: Page) => {
  await page.goto("/dashboard")
  await expect(
    page.getByRole("heading", { name: "Overview", level: 1 })
  ).toBeVisible()
  const geometry = await readConsoleShellGeometry(page)
  await expectShellContract(page, geometry)

  return geometry
}

test("console loadingは実画面と同じshell geometryを維持する", async ({
  context,
  page,
}) => {
  await useAdminSession(context)
  const loadedGeometry = await readLoadedDashboardGeometry(page)

  await page.goto("about:blank")
  const delayResponse = await context.request.post(
    `${mockApiUrl}/__e2e/request-delays`,
    { data: { path: "/me", method: "GET", delayMs: 2_000 } }
  )
  expect(delayResponse.status()).toBe(201)

  const navigation = page.goto("/dashboard?boundary-state=loading")
  await expect(
    page.locator('[data-console-shell][data-boundary-state="loading"]:visible')
  ).toBeVisible()
  const loadingGeometry = await readConsoleShellGeometry(page)
  await expectShellContract(page, loadingGeometry)
  expectShellGeometryToMatch(loadingGeometry, loadedGeometry, "loading")

  await navigation
  await expect(
    page.getByRole("heading", { name: "Overview", level: 1 })
  ).toBeVisible()
  expectShellGeometryToMatch(
    await readConsoleShellGeometry(page),
    loadedGeometry,
    "loaded-after-loading"
  )
  expect(
    await (
      await context.request.get(`${mockApiUrl}/__e2e/request-delays`)
    ).json()
  ).toEqual([])
})

test("Issuesへの遷移loadingは既存shellと実画面のcontent geometryを維持する", async ({
  context,
  page,
}) => {
  await useAdminSession(context)
  const dashboardGeometry = await readLoadedDashboardGeometry(page)
  const readyShell = await page
    .locator("[data-console-shell]:visible")
    .elementHandle()
  if (!readyShell) {
    throw new Error("the ready console shell was not mounted")
  }

  const delayResponse = await context.request.post(
    `${mockApiUrl}/__e2e/request-delays`,
    { data: { path: "/issues", method: "GET", delayMs: 2_000 } }
  )
  expect(delayResponse.status()).toBe(201)

  await navigateFromConsoleSidebar(page, "Issues")
  await expect(
    page
      .locator("[data-console-shell]:visible")
      .locator(
        '[data-slot="page-shell"][data-boundary-state="loading"][aria-label="Loading organization issues"]'
      )
      .first()
  ).toBeVisible()
  await expect(
    page
      .locator("[data-console-shell]:visible")
      .locator('[data-slot="console-header"]'),
    "the selected organization header should survive route loading"
  ).toContainText("Alpha Operations")
  expect(
    await page
      .locator("[data-console-shell]:visible")
      .evaluate((shell, previousShell) => shell === previousShell, readyShell),
    "nested loading should preserve the mounted console shell"
  ).toBeTruthy()
  if ((page.viewportSize()?.width ?? 0) < 768) {
    await expect(page.getByRole("dialog", { name: "Sidebar" })).toBeHidden()
  }
  const loadingGeometry = await readConsoleShellGeometry(page)
  await expectShellContract(page, loadingGeometry)
  expectConsoleFrameGeometryToMatch(
    loadingGeometry,
    dashboardGeometry,
    "nested loading"
  )

  await expect(
    page.getByRole("heading", { name: "Issues", level: 1 })
  ).toBeVisible()
  expect(
    await page
      .locator("[data-console-shell]:visible")
      .evaluate((shell, previousShell) => shell === previousShell, readyShell),
    "loaded Issues should keep the same console shell"
  ).toBeTruthy()
  const loadedIssuesGeometry = await readConsoleShellGeometry(page)
  await expectShellContract(page, loadedIssuesGeometry)
  expectConsoleFrameGeometryToMatch(
    loadedIssuesGeometry,
    dashboardGeometry,
    "loaded issues"
  )
  expectPageGeometryToMatch(
    loadingGeometry,
    loadedIssuesGeometry,
    "nested loading",
    frameDimensions,
    frameDimensions
  )
})

test("console error boundaryは実画面と同じshell geometryを維持して復帰する", async ({
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
  const loadedGeometry = await readLoadedDashboardGeometry(page)

  await page.goto("about:blank")
  const faultResponse = await context.request.post(
    `${mockApiUrl}/__e2e/faults`,
    {
      data: {
        path: "/me",
        method: "GET",
        status: 503,
        code: "dependency_unavailable",
        message: "Injected console boundary outage",
      },
    }
  )
  expect(faultResponse.status()).toBe(201)

  await page.goto("/dashboard?boundary-state=error")
  await expect(
    page.locator('[data-console-shell][data-boundary-state="error"]:visible')
  ).toBeVisible()
  await expect(
    page.getByRole("heading", {
      name: "Overview",
      level: 1,
    })
  ).toBeFocused()
  const errorGeometry = await readConsoleShellGeometry(page)
  await expectShellContract(page, errorGeometry)
  expectConsoleFrameGeometryToMatch(errorGeometry, loadedGeometry, "error")
  expectPageGeometryToMatch(errorGeometry, loadedGeometry, "error")

  await page.getByRole("button", { name: "Try again" }).click()
  await expect(
    page.locator(
      '[data-slot="page-shell"][data-boundary-state="error"]:visible'
    )
  ).toHaveCount(0)
  await expect(
    page.locator('[data-console-shell][data-boundary-state="ready"]:visible')
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Overview", level: 1 })
  ).toBeVisible()
  expectShellGeometryToMatch(
    await readConsoleShellGeometry(page),
    loadedGeometry,
    "recovered-after-error"
  )
})

test("console内のpage error boundaryはshellを保ってfocusと再試行を復元する", async ({
  allowClientErrors,
  context,
  page,
}) => {
  allowClientErrors(
    /Injected dashboard boundary outage/,
    /Failed to load resource.*503/,
    productionServerComponentRenderError
  )
  await useAdminSession(context)
  const loadedDashboardGeometry = await readLoadedDashboardGeometry(page)

  await page.goto("/organization/alpha-operations/issues")
  await expect(
    page.getByRole("heading", { name: "Issues", level: 1 })
  ).toBeVisible()
  const issuesGeometry = await readConsoleShellGeometry(page)
  const readyShell = await page
    .locator("[data-console-shell]:visible")
    .elementHandle()
  if (!readyShell) {
    throw new Error("the ready console shell was not mounted")
  }

  const faultResponse = await context.request.post(
    `${mockApiUrl}/__e2e/faults`,
    {
      data: {
        path: "/issues",
        method: "GET",
        status: 503,
        code: "dependency_unavailable",
        message: "Injected dashboard boundary outage",
      },
    }
  )
  expect(faultResponse.status()).toBe(201)

  await navigateFromConsoleSidebar(page, "Overview")
  await expect(
    page.locator('[data-slot="page-shell"][data-boundary-state="error"]')
  ).toBeVisible()
  const errorHeading = page.getByRole("heading", {
    name: "Overview",
    level: 1,
  })
  await expect(errorHeading).toBeVisible()
  await expect(errorHeading).toBeFocused()
  expect(
    await page
      .locator("[data-console-shell]:visible")
      .evaluate((shell, previousShell) => shell === previousShell, readyShell),
    "the page error boundary should preserve the mounted console shell"
  ).toBeTruthy()

  const errorGeometry = await readConsoleShellGeometry(page)
  await expectShellContract(page, errorGeometry)
  expectConsoleFrameGeometryToMatch(
    errorGeometry,
    issuesGeometry,
    "nested error"
  )
  expectPageGeometryToMatch(
    errorGeometry,
    loadedDashboardGeometry,
    "nested error"
  )

  await page.getByRole("button", { name: "Try again" }).click()
  await expect(
    page.locator(
      '[data-slot="page-shell"][data-boundary-state="error"]:visible'
    )
  ).toHaveCount(0)
  await expect(
    page.locator('[data-console-shell][data-boundary-state="ready"]:visible')
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Overview", level: 1 })
  ).toBeVisible()
  expectShellGeometryToMatch(
    await readConsoleShellGeometry(page),
    loadedDashboardGeometry,
    "recovered nested error"
  )
})
