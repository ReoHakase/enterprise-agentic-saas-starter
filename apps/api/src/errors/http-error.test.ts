import { describe, expect, it } from "vitest"

import {
  HttpError,
  httpErrorCodes,
  httpMessageByErrorCode,
  httpStatusFor,
  type HttpErrorCode,
} from "./http-error"

const expectedStatusByCode = {
  active_organization_mismatch: 409,
  active_organization_required: 409,
  confirmation_required: 400,
  conflict: 409,
  csrf_origin_forbidden: 403,
  forbidden: 403,
  internal_error: 500,
  not_found: 404,
  rate_limited: 429,
  service_unavailable: 503,
  step_up_required: 403,
  unauthorized: 401,
  unsupported_media_type: 415,
  validation_error: 400,
} as const satisfies Record<HttpErrorCode, number>

describe("HttpErrorの契約", () => {
  it.each(httpErrorCodes)("%sを固定HTTP statusへ写像する", (code) => {
    const error = new HttpError({ code })

    expect(error.code).toBe(code)
    expect(httpStatusFor(code)).toBe(expectedStatusByCode[code])
    expect(httpMessageByErrorCode[code]).toBeTruthy()
  })

  it("causeと明示公開したpresentation metadataだけを維持する", () => {
    const cause = new Error("provider detail")
    const error = new HttpError({
      cause,
      code: "service_unavailable",
      fieldErrors: { file: ["Choose another file."] },
      publicMessage: "Choose another file.",
      retryAfter: 17,
    })

    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({
      cause,
      code: "service_unavailable",
      fieldErrors: { file: ["Choose another file."] },
      message: "service_unavailable",
      publicMessage: "Choose another file.",
      retryAfter: 17,
    })
    expect(error).not.toHaveProperty("privateContext")
    expect(error).not.toHaveProperty("publicContext")
    expect(error).not.toHaveProperty("statusCode")
  })

  it("不正なretry metadataを無視する", () => {
    expect(
      new HttpError({ code: "rate_limited", retryAfter: Number.NaN })
    ).toHaveProperty("retryAfter", undefined)
    expect(
      new HttpError({ code: "rate_limited", retryAfter: -1 })
    ).toHaveProperty("retryAfter", undefined)
  })
})
