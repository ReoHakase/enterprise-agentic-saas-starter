import { isNotFound, isRedirect } from "@tanstack/react-router"
import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from "@tanstack/react-start"
import { setResponseStatus } from "@tanstack/react-start/server"

import { reportObservedError } from "@/lib/report-observed-error"

const PUBLIC_SERVER_FUNCTION_ERROR_MESSAGE =
  "The service is temporarily unavailable."

const createPublicServerFunctionError = () =>
  new Error(PUBLIC_SERVER_FUNCTION_ERROR_MESSAGE)

const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === "serverFn",
})

const serverFunctionErrorMiddleware = createMiddleware({
  type: "function",
}).server(async ({ next }) => {
  try {
    return await next()
  } catch (error) {
    if (error instanceof Response || isRedirect(error) || isNotFound(error)) {
      throw error
    }

    reportObservedError(error, { operation: "web.server-function" })
    setResponseStatus(500)
    throw createPublicServerFunctionError()
  }
})

export const startInstance = createStart(() => ({
  functionMiddleware: [serverFunctionErrorMiddleware],
  requestMiddleware: [csrfMiddleware],
}))
