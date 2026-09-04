import { expect, test } from "./fixtures/test"

test("アカウント追加時の不明な認証routeを公開エラーへ変換する", async ({
  allowClientErrors,
  page,
}) => {
  allowClientErrors(/Unknown view/)

  await page.goto("/auth/not-a-view?add_account=1")

  await expect(page).toHaveURL(/\/auth\/not-a-view\?add_account=1$/u)
  await expect(
    page.getByRole("heading", {
      name: "Authentication could not be loaded",
      level: 1,
    })
  ).toBeVisible()
  await expect(page.getByText("Add account", { exact: true })).toBeVisible()
})
