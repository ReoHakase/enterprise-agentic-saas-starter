import { expect, test } from "@playwright/test"

test("E1の並列実行前に主要routeをcompileする", async ({ context, page }) => {
  await page.goto("/auth/sign-in")
  await expect(page.getByText("Sign In", { exact: true })).toBeVisible({
    timeout: 60_000,
  })

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

  await page.goto("/dashboard")
  await expect(
    page.getByRole("heading", { name: "Overview", level: 1 })
  ).toBeVisible({ timeout: 60_000 })

  await page.goto("/organization/alpha-operations/issues")
  await expect(
    page.getByRole("heading", { name: "Issues", level: 1 })
  ).toBeVisible({ timeout: 60_000 })
})
