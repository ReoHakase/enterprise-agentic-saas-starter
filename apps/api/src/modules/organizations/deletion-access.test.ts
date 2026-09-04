import { describe, expect, it } from "vitest"

import { HttpError } from "../../errors/http-error"
import { parseOrganizationDeletionIdempotencyKey } from "./routes/deletion-access"

describe("organization削除access", () => {
  it("上限付きopaque idempotency keyを受理する", () => {
    expect(
      parseOrganizationDeletionIdempotencyKey("delete_org_01JQ8YF2J7Q0")
    ).toBe("delete_org_01JQ8YF2J7Q0")
  })

  it.each([
    { label: "未設定のidempotency key", value: undefined },
    { label: "短すぎるidempotency key", value: "short" },
    {
      label: "空白を含むidempotency key",
      value: "delete org key with spaces",
    },
    { label: "長すぎるidempotency key", value: "x".repeat(129) },
  ])("値を反射せず$labelを拒否する", ({ value }) => {
    try {
      parseOrganizationDeletionIdempotencyKey(value)
      throw new Error("Expected idempotency key validation to fail")
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError)
      expect(error).toMatchObject({ code: "validation_error" })
      expect(String(error)).not.toContain(String(value))
    }
  })
})
