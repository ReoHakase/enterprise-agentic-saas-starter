import { Elysia } from "elysia"

export const requestIdPlugin = new Elysia({ name: "request-id" }).onRequest(
  ({ request, set }) => {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID()

    set.headers["x-request-id"] = requestId
  }
)
