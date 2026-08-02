import {
  expect,
  test as base,
  type BrowserContext,
  type ConsoleMessage,
  type Page,
} from "@playwright/test"

type ClientDiagnosticsFixtures = {
  agentScenario: AgentScenario
  allowClientErrors: (...patterns: RegExp[]) => void
  assertNoClientErrors: void
  clientErrorPolicy: {
    allowedPatterns: RegExp[]
    browserName: string
  }
}

type AgentWorkerFixtures = {
  agentWorkerSession: {
    oauthUserLogin: "oauth-alice" | "oauth-bob"
    storageState:
      | Awaited<ReturnType<BrowserContext["storageState"]>>
      | undefined
  }
}

export type AgentScenario = {
  namespace: string
  oauthUserLogin: "oauth-alice" | "oauth-bob"
  organizationName: string
  organizationSlug: string
}

export const productionServerComponentRenderError =
  /An error occurred in the Server Components render\. The specific message is omitted in production builds/

const formatConsoleError = (message: ConsoleMessage) => {
  const location = message.location()
  const source = location.url
    ? ` (${location.url}:${location.lineNumber}:${location.columnNumber})`
    : ""

  return `console.error: ${message.text()}${source}`
}

const watchClientErrors = (page: Page) => {
  const errors: string[] = []

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(formatConsoleError(message))
    }
  })
  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`)
  })

  return errors
}

const scenarioHash = (value: string) => {
  let hash = 2_166_136_261
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0).toString(36)
}

const scenarioRunId = (metadata: Record<string, unknown>) => {
  const value = Reflect.get(metadata, "agentE2ERunId")
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error("Deterministic Agent E2E run id metadata is invalid")
  }
  return value
}

export const test = base.extend<ClientDiagnosticsFixtures, AgentWorkerFixtures>(
  {
    agentWorkerSession: [
      async ({ browser }, use, workerInfo) => {
        const oauthUserLogin =
          workerInfo.parallelIndex % 2 === 0 ? "oauth-alice" : "oauth-bob"
        if (!workerInfo.project.name.startsWith("e1-scripted-agent-")) {
          await use({ oauthUserLogin, storageState: undefined })
          return
        }

        const baseURL = workerInfo.project.use.baseURL
        if (typeof baseURL !== "string") {
          throw new Error("Deterministic Agent E2E base URL is missing")
        }
        const context = await browser.newContext({ baseURL })
        try {
          const page = await context.newPage()
          await page.goto(
            "/auth/sign-in?redirectTo=%2Fsettings%2Forganizations"
          )
          await page.getByRole("button", { name: "GitHub" }).click()
          await page
            .getByRole("button", { name: new RegExp(oauthUserLogin, "u") })
            .click()
          await expect(page).toHaveURL(/\/settings\/organizations$/u)
          await use({
            oauthUserLogin,
            storageState: await context.storageState(),
          })
        } finally {
          await context.close()
        }
      },
      { scope: "worker" },
    ],
    storageState: async ({ agentWorkerSession }, use) => {
      await use(agentWorkerSession.storageState)
    },
    agentScenario: async (
      { agentWorkerSession, browserName },
      use,
      testInfo
    ) => {
      const runId = scenarioRunId(testInfo.config.metadata)
      const namespace = [
        "e1",
        runId,
        testInfo.project.name,
        browserName,
        testInfo.parallelIndex,
        testInfo.retry,
        testInfo.repeatEachIndex,
        scenarioHash(testInfo.testId),
      ]
        .join("-")
        .toLowerCase()
        .replaceAll(/[^a-z0-9-]/g, "-")
      const suffix = namespace.slice(-24)

      await use({
        namespace,
        oauthUserLogin: agentWorkerSession.oauthUserLogin,
        organizationName: `Scripted Agent ${suffix}`,
        organizationSlug: `scripted-agent-${suffix}`,
      })
    },
    clientErrorPolicy: async ({ browserName }, use) => {
      await use({ allowedPatterns: [], browserName })
    },
    allowClientErrors: async ({ clientErrorPolicy }, use) => {
      await use((...patterns) => {
        clientErrorPolicy.allowedPatterns.push(...patterns)
      })
    },
    assertNoClientErrors: [
      async ({ clientErrorPolicy, page }, use, testInfo) => {
        // Next/Turbopack development can emit an invalid RSC timing interval
        // during redirects and error-boundary recovery. Suppress only that
        // framework-owned measurement; product timing and every other browser
        // error remain visible to this fixture.
        // https://github.com/vercel/next.js/issues/86060
        await page.addInitScript(() => {
          const originalMeasure: Performance["measure"] =
            window.performance.measure.bind(window.performance)

          Object.defineProperty(window.performance, "measure", {
            configurable: true,
            value: (
              measurementName: string,
              startOrMeasureOptions?: string | PerformanceMeasureOptions,
              endMark?: string
            ) => {
              try {
                return typeof startOrMeasureOptions === "object"
                  ? originalMeasure(measurementName, startOrMeasureOptions)
                  : originalMeasure(
                      measurementName,
                      startOrMeasureOptions,
                      endMark
                    )
              } catch (error) {
                if (
                  measurementName.startsWith("\u200b") &&
                  error instanceof Error &&
                  error.message.includes("cannot have a negative time stamp")
                ) {
                  return undefined
                }
                throw error
              }
            },
          })
        })

        const errors = watchClientErrors(page)

        await use()

        const unexpectedErrors = errors.filter(
          (error) =>
            !clientErrorPolicy.allowedPatterns.some((pattern) =>
              pattern.test(error)
            )
        )
        if (testInfo.config.metadata.agentE2EMode === "full") {
          expect(
            unexpectedErrors.length,
            "unexpected browser console/page error count"
          ).toBe(0)
          return
        }
        expect(
          unexpectedErrors,
          "unexpected browser console/page errors"
        ).toEqual([])
      },
      { auto: true },
    ],
  }
)

export { expect }
