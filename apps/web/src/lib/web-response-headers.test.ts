import { describe, expect, it } from "vitest"

import {
  createGetOnlyOptionsResponse,
  createMethodNotAllowedResponse,
} from "./web-response-headers"

describe("GET専用route response", () => {
  it.each([
    {
      body: "",
      caseLabel: "OPTIONS",
      createResponse: createGetOnlyOptionsResponse,
      status: 204,
    },
    {
      body: "Method Not Allowed",
      caseLabel: "非対応method",
      createResponse: createMethodNotAllowedResponse,
      status: 405,
    },
  ])(
    "Given GET専用route, When $caseLabel を処理する, Then method contractを返す",
    async ({ body, createResponse, status }) => {
      const response = createResponse()

      expect(response.status).toBe(status)
      expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS")
      expect(response.headers.get("content-security-policy")).toContain(
        "connect-src 'self'"
      )
      expect(response.headers.get("referrer-policy")).toBe("same-origin")
      expect(await response.text()).toBe(body)
    }
  )
})
