import {
  expect,
  test as base,
  type ConsoleMessage,
  type Page,
} from "@playwright/test"

type ClientDiagnosticsFixtures = {
  allowClientErrors: (...patterns: RegExp[]) => void
  assertNoClientErrors: void
  clientErrorPolicy: {
    allowedPatterns: RegExp[]
    browserName: string
  }
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

export const test = base.extend<ClientDiagnosticsFixtures>({
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
