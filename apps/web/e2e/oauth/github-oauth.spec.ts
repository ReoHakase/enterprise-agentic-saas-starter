import { expect, test } from "../fixtures/test"

const apiOrigin = "http://api.oauth-e2e.enterprise-agentic-saas.localhost:3101"
const apiLoopbackOrigin = "http://127.0.0.1:3101"
const githubOrigin = "http://127.0.0.1:4101"

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
  const cookieHeader = (await context.cookies())
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ")

  const sessionResponse = await context.request.get(
    `${apiLoopbackOrigin}/auth/get-session`,
    {
      headers: {
        cookie: cookieHeader,
        origin: new URL(page.url()).origin,
      },
    }
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
    `${apiLoopbackOrigin}/auth/list-accounts`,
    {
      headers: {
        cookie: cookieHeader,
        origin: new URL(page.url()).origin,
      },
    }
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

test("実WebAuthn ceremonyでpasskeyを登録・再読込・削除できる", async ({
  context,
  page,
}) => {
  const cdp = await context.newCDPSession(page)
  await cdp.send("WebAuthn.enable")
  const { authenticatorId } = await cdp.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        transport: "usb",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    }
  )

  try {
    await page.goto("/auth/sign-in?redirectTo=%2Fsettings%2Faccount")
    await page.getByRole("button", { name: "GitHub" }).click()
    await page.getByRole("button", { name: /oauth-alice/ }).click()
    await expect(page).toHaveURL(/\/settings\/account$/u)

    const generateOptions = page.waitForResponse(
      (response) =>
        response.url().includes("/auth/passkey/generate-register-options") &&
        response.request().method() === "GET"
    )
    const verifyRegistration = page.waitForResponse(
      (response) =>
        response.url().endsWith("/auth/passkey/verify-registration") &&
        response.request().method() === "POST"
    )
    await page.getByRole("button", { name: "Add passkey" }).click()
    expect((await generateOptions).status()).toBe(200)
    expect((await verifyRegistration).status()).toBe(200)
    await expect(page.getByText("Passkey added", { exact: true })).toBeVisible()

    const listAfterRegistration = await context.request.get(
      `${apiOrigin}/auth/passkey/list-user-passkeys`
    )
    expect(listAfterRegistration.status()).toBe(200)
    expect(await listAfterRegistration.json()).toEqual([
      expect.objectContaining({
        name: "Enterprise Agentic SaaS",
        credentialID: expect.any(String),
      }),
    ])

    await page.reload()
    await expect(
      page.getByText("Enterprise Agentic SaaS", { exact: true })
    ).toBeVisible()

    await page.getByRole("button", { name: "Delete" }).click()
    const deleteRegistration = page.waitForResponse(
      (response) =>
        response.url().endsWith("/auth/passkey/delete-passkey") &&
        response.request().method() === "POST"
    )
    await page.getByRole("button", { name: "Delete passkey" }).click()
    expect((await deleteRegistration).status()).toBe(200)
    await expect(
      page.getByText("No passkeys are registered yet.")
    ).toBeVisible()

    const listAfterDeletion = await context.request.get(
      `${apiOrigin}/auth/passkey/list-user-passkeys`
    )
    expect(listAfterDeletion.status()).toBe(200)
    expect(await listAfterDeletion.json()).toEqual([])
  } finally {
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId })
    await cdp.send("WebAuthn.disable")
  }
})
