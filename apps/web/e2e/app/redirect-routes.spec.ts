import type { BrowserContext } from "@playwright/test"

import { expect, test } from "./fixtures/test"

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

test("legacy todo route resolves to the active organization Issue route", async ({
  context,
  page,
}) => {
  await useAdminSession(context)
  await page.goto("/dashboard/todos")

  await expect(page).toHaveURL("/organization/alpha-operations/issues")
  await expect(
    page.getByRole("heading", { level: 1, name: "Issues" })
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
})

test("onboarding route resolves to organization selection", async ({
  context,
  page,
}) => {
  await useAdminSession(context)
  await page.goto("/onboarding")

  await expect(page).toHaveURL("/settings/organizations")
  await expect(
    page.getByRole("heading", { level: 1, name: "Organizations" })
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
})
