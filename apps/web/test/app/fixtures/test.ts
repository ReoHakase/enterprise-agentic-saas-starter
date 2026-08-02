import {
  expect,
  test as base,
  type APIRequestContext,
  type ConsoleMessage,
  type Page,
} from "@playwright/test"

import { nextjsIntegrationEnvironment } from "./environment"

type ClientDiagnosticsFixtures = {
  allowClientErrors: (...patterns: RegExp[]) => void
  assertNoClientErrors: void
  clientErrorPolicy: {
    allowedPatterns: RegExp[]
    browserName: string
  }
  createRequestGate: CreateRequestGate
  e2eNamespace: string
}

export type RequestGate = {
  release: () => Promise<void>
  waitUntilRequested: () => Promise<void>
}

export type CreateRequestGate = (
  path: string,
  method?: string
) => Promise<RequestGate>

const mockApiUrl = nextjsIntegrationEnvironment.apiOrigin

export const productionServerComponentRenderError =
  /An error occurred in the Server Components render\. The specific message is omitted in production builds/

const hashTestId = (value: string) => {
  let hash = 2_166_136_261
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0).toString(36)
}

const resetNamespace = async (
  request: APIRequestContext,
  namespace: string
) => {
  const response = await request.post(`${mockApiUrl}/__e2e/reset`, {
    headers: { "x-e2e-namespace": namespace },
  })
  expect(response.ok()).toBeTruthy()
}

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

export const test = base.extend<ClientDiagnosticsFixtures>({
  e2eNamespace: [
    async ({ context, request }, use, testInfo) => {
      if (!testInfo.project.name.startsWith("nextjs-integration-")) {
        await use("external-stack")
        return
      }

      const namespace = [
        "e2e",
        testInfo.project.name,
        testInfo.workerIndex,
        testInfo.retry,
        hashTestId(testInfo.testId),
      ]
        .join("-")
        .replaceAll(/[^A-Za-z0-9_-]/g, "-")

      await context.addCookies([
        {
          name: "e2e-namespace",
          value: namespace,
          domain: "127.0.0.1",
          path: "/",
          sameSite: "Lax",
        },
      ])
      await resetNamespace(request, namespace)

      try {
        await use(namespace)
      } finally {
        await resetNamespace(request, namespace)
      }
    },
    { auto: true },
  ],
  createRequestGate: async ({ e2eNamespace, request }, use) => {
    const activeGates = new Set<RequestGate>()
    const headers = { "x-e2e-namespace": e2eNamespace }

    try {
      await use(async (path, requestedMethod = "GET") => {
        const method = requestedMethod.toUpperCase()
        const response = await request.post(
          `${mockApiUrl}/__e2e/request-gates`,
          {
            data: { method, path },
            headers,
          }
        )
        expect(response.status()).toBe(201)

        let released = false
        const gate: RequestGate = {
          waitUntilRequested: async () => {
            await expect
              .poll(
                async () => {
                  const statusResponse = await request.get(
                    `${mockApiUrl}/__e2e/request-gates`,
                    { headers }
                  )
                  if (!statusResponse.ok()) return false
                  const rules: unknown = await statusResponse.json()
                  return (
                    Array.isArray(rules) &&
                    rules.some(
                      (rule) =>
                        typeof rule === "object" &&
                        rule !== null &&
                        Reflect.get(rule, "method") === method &&
                        Reflect.get(rule, "path") === path &&
                        Reflect.get(rule, "requested") === true
                    )
                  )
                },
                { message: `${method} ${path} should reach the request gate` }
              )
              .toBe(true)
          },
          release: async () => {
            if (released) return
            released = true
            activeGates.delete(gate)
            const releaseResponse = await request.post(
              `${mockApiUrl}/__e2e/request-gates/release`,
              { data: { method, path }, headers }
            )
            expect(releaseResponse.ok()).toBeTruthy()
          },
        }
        activeGates.add(gate)
        return gate
      })
    } finally {
      await Promise.all([...activeGates].map((gate) => gate.release()))
    }
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
    async ({ clientErrorPolicy, page }, use) => {
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
      expect(
        unexpectedErrors,
        "unexpected browser console/page errors"
      ).toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
