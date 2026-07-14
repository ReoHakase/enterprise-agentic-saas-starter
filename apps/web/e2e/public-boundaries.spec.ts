import type { Locator, Page } from "@playwright/test"

import { expect, test } from "./fixtures/test"

type Geometry = {
  height: number
  width: number
  x: number
  y: number
}

const geometryTolerance = 1

const readGeometry = async (locator: Locator, label: string) => {
  await expect(locator, `${label} should be visible`).toBeVisible()
  const geometry = await locator.boundingBox()
  expect(geometry, `${label} should have a measurable box`).not.toBeNull()
  if (!geometry) {
    throw new Error(`${label} did not expose a measurable box`)
  }

  return geometry
}

const expectGeometryToMatch = (
  actual: Geometry,
  expected: Geometry,
  label: string
) => {
  for (const dimension of ["x", "y", "width", "height"] as const) {
    expect(
      Math.abs(actual[dimension] - expected[dimension]),
      `${label}.${dimension} should remain stable`
    ).toBeLessThanOrEqual(geometryTolerance)
  }
}

const readAuthGeometry = async (page: Page) => ({
  frame: await readGeometry(
    page.locator('[data-slot="auth-frame"]:visible'),
    "authentication frame"
  ),
  panel: await readGeometry(
    page.locator('[data-slot="auth-panel"]:visible'),
    "authentication panel"
  ),
  status: await readGeometry(
    page.locator('[data-slot="auth-context-status"]:visible'),
    "authentication context status"
  ),
})

test("add-account auth errorは実画面と同じframe geometryを維持する", async ({
  allowClientErrors,
  page,
}) => {
  allowClientErrors(/Unknown view/)

  await page.goto("/auth/sign-in?add_account=1")
  await expect(
    page.locator(
      '[data-slot="auth-panel"] > [data-slot="card"]:not([data-boundary-state]):visible'
    )
  ).toBeVisible()
  await expect(
    page.locator('[data-boundary-state="loading"]:visible')
  ).toHaveCount(0)
  const readyGeometry = await readAuthGeometry(page)

  await page.goto("/auth/not-a-view?add_account=1")
  const errorHeading = page.getByRole("heading", {
    name: "Authentication could not be loaded",
    level: 1,
  })
  await expect(errorHeading).toBeVisible()
  await expect(errorHeading).toBeFocused()
  await expect(page.getByText("Add account", { exact: true })).toBeVisible()
  await expect(
    page.locator(
      '[data-slot="auth-panel"] > [data-slot="card"]:not([data-boundary-state]):visible'
    )
  ).toHaveCount(0)
  const errorGeometry = await readAuthGeometry(page)

  expectGeometryToMatch(errorGeometry.frame, readyGeometry.frame, "auth frame")
  expectGeometryToMatch(errorGeometry.panel, readyGeometry.panel, "auth panel")
  expectGeometryToMatch(
    errorGeometry.status,
    readyGeometry.status,
    "auth context status"
  )

  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }))
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport)
  expect(overflow.body).toBeLessThanOrEqual(overflow.viewport)
})
