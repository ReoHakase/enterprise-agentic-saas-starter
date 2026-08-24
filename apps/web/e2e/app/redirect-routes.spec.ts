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

test("旧todoルートは現在の組織のIssueルートへ解決される", async ({
  context,
  page,
}) => {
  await useAdminSession(context)
  await page.goto("/dashboard/todos")

  await expect(page).toHaveURL("/organization/alpha-operations/issues")
  await expect(
    page.getByRole("heading", { level: 1, name: "Issues" })
  ).toBeVisible()
})

test("オンボーディングルートは組織選択へ解決される", async ({
  context,
  page,
}) => {
  await useAdminSession(context)
  await page.goto("/onboarding")

  await expect(page).toHaveURL("/settings/organizations")
  await expect(
    page.getByRole("heading", { level: 1, name: "Organizations" })
  ).toBeVisible()
})
