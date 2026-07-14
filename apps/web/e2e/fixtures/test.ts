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
