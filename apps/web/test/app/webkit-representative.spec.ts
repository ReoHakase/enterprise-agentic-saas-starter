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

test("WebKit representative journey preserves public and tenant semantics", async ({
  context,
  page,
}) => {
  await page.goto("/auth/sign-in")
  await expect(page.getByText("Sign In", { exact: true })).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Send Magic Link" })
  ).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(
      await page.evaluate(() => document.documentElement.clientWidth)
    )

  await useAdminSession(context)
  await page.goto("/organization/alpha-operations/issues")

  await expect(
    page.getByRole("heading", { level: 1, name: "Issues" })
  ).toBeVisible()
  await expect(page.getByText("Review tenant audit log")).toBeVisible()
  await expect(page).toHaveURL(/\/organization\/alpha-operations\/issues$/u)
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(
      await page.evaluate(() => document.documentElement.clientWidth)
    )
})
