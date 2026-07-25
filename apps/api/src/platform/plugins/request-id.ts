import { Elysia } from "elysia"

const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

/** @internal */
export const trustedRequestId = (value: string | null): string =>
  value && requestIdPattern.test(value) ? value : crypto.randomUUID()

export const requestIdPlugin = new Elysia({ name: "request-id" }).onRequest(
  ({ request, set }) => {
    const requestId = trustedRequestId(request.headers.get("x-request-id"))

    set.headers["x-request-id"] = requestId
  }
)
