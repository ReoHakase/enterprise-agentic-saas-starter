import { expect, test } from "../fixtures/test"

const apiOrigin = "http://api.oauth-e2e.enterprise-agentic-saas.localhost:3101"
const githubOrigin =
  "http://github.oauth-e2e.enterprise-agentic-saas.localhost:4101"

test("GitHub emulatorで認証しsessionを永続化できる", async ({
  context,
  page,
}) => {
  await page.goto("/auth/sign-in?redirectTo=%2Fsettings%2Forganizations")

  await page.getByRole("button", { name: "GitHub" }).click()

  const localUser = page.getByRole("button", { name: /oauth-alice/ })
  await expect(localUser).toBeVisible()
  await expect(
    page.getByText("Sign in to GitHub", { exact: true })
  ).toBeVisible()
  const authorizationUrl = new URL(page.url())
  expect(authorizationUrl.origin).toBe(githubOrigin)
  expect(authorizationUrl.pathname).toBe("/login/oauth/authorize")
  expect(authorizationUrl.searchParams.get("client_id")).toBe(
    "enterprise-agentic-saas-local"
  )
  expect(authorizationUrl.searchParams.has("state")).toBe(true)
  expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
    `${apiOrigin}/auth/oauth2/callback/github`
  )
  await localUser.click()

  await expect(page).toHaveURL(/\/settings\/organizations$/)
  await expect(page.getByText("Create your first organization")).toBeVisible()

  const sessionResponse = await context.request.get(
    `${apiOrigin}/auth/get-session`
  )
  expect(sessionResponse.ok()).toBeTruthy()
  expect(await sessionResponse.json()).toEqual(
    expect.objectContaining({
      user: expect.objectContaining({
        email: "oauth-alice@example.test",
        emailVerified: true,
        image: `${githubOrigin}/avatars/u/oauth-alice`,
        name: "OAuth Alice",
      }),
    })
  )

  const accountsResponse = await context.request.get(
    `${apiOrigin}/auth/list-accounts`
  )
  expect(accountsResponse.ok()).toBeTruthy()
  expect(await accountsResponse.json()).toEqual(
    expect.arrayContaining([expect.objectContaining({ providerId: "github" })])
  )

  const sessionCookie = (await context.cookies()).find((cookie) =>
    cookie.name.includes("session_token")
  )
  expect(sessionCookie).toEqual(
    expect.objectContaining({
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    })
  )
  expect(sessionCookie?.domain).toContain(
    "oauth-e2e.enterprise-agentic-saas.localhost"
  )

  await page.reload()
  await expect(page).toHaveURL(/\/settings\/organizations$/)
  await expect(page.getByText("Create your first organization")).toBeVisible()
})
