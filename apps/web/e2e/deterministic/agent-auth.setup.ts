import {
  expect,
  test as setup,
  type Browser,
  type FullConfig,
} from "@playwright/test"

import {
  createAgentE2EEnvironment,
  parseAgentE2ERunId,
} from "../fixtures/agent-e2e-environment"

const runIdFromConfig = (config: FullConfig) =>
  parseAgentE2ERunId(Reflect.get(config.metadata, "agentE2ERunId"))

const authenticate = async (
  browser: Browser,
  baseURL: string,
  oauthUserLogin: "oauth-alice" | "oauth-bob"
) => {
  const context = await browser.newContext({ baseURL })
  try {
    const page = await context.newPage()
    await page.goto("/auth/sign-in?redirectTo=%2Fsettings%2Forganizations")
    await page.getByRole("button", { name: "GitHub" }).click()
    await page
      .getByRole("button", { name: new RegExp(oauthUserLogin, "u") })
      .click()
    await expect(page).toHaveURL(/\/settings\/organizations$/u)
  } finally {
    await context.close()
  }
}

setup("provision scripted Agent users", async ({ browser }, testInfo) => {
  const environment = createAgentE2EEnvironment(
    runIdFromConfig(testInfo.config)
  )

  await authenticate(browser, environment.webOrigin, "oauth-alice")
  await authenticate(browser, environment.webOrigin, "oauth-bob")
})
