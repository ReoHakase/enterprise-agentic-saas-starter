import { describe, expect, it } from "vitest"

import { HttpError } from "../../errors/http-error"
import { parseOrganizationDeletionIdempotencyKey } from "./routes/deletion-access"

describe("organization deletion access", () => {
  it("accepts a bounded opaque idempotency key", () => {
    expect(
      parseOrganizationDeletionIdempotencyKey("delete_org_01JQ8YF2J7Q0")
    ).toBe("delete_org_01JQ8YF2J7Q0")
  })

  it.each([undefined, "short", "delete org key with spaces", "x".repeat(129)])(
    "rejects an unsafe idempotency key without reflecting its value (%s)",
    (value) => {
      try {
        parseOrganizationDeletionIdempotencyKey(value)
        throw new Error("Expected idempotency key validation to fail")
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError)
        expect(error).toMatchObject({ code: "validation_error" })
        expect(String(error)).not.toContain(String(value))
      }
    }
  )
})
