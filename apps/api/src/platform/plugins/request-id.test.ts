import { Elysia } from "elysia"
import { describe, expect, it } from "vitest"

import { errorPlugin } from "./error"
import { requestIdPlugin, trustedRequestId } from "./request-id"

describe("trustedRequestIdの契約", () => {
  it("安全なcorrelation idを維持する", () => {
    expect(trustedRequestId("req_01.test:api")).toBe("req_01.test:api")
  })

  it("長すぎる値と制御文字を新しいUUIDへ置き換える", () => {
    expect(trustedRequestId("a".repeat(129))).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    expect(trustedRequestId("request\nsecret")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
  })

  it("invalidなclient valueをerror responseへ反射しない", async () => {
    const untrusted = "a".repeat(129)
    const app = new Elysia()
      .use(requestIdPlugin)
      .use(errorPlugin)
      .get("/error", () => {
        throw new Error("test error")
      })

    const response = await app.handle(
      new Request("http://localhost/error", {
        headers: { "x-request-id": untrusted },
      })
    )
    const body = await response.json()
    const requestId = response.headers.get("x-request-id")

    expect(requestId).not.toBe(untrusted)
    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    expect(body).toEqual({
      error: "internal_error",
      message: "An unexpected error occurred.",
    })
  })
})
