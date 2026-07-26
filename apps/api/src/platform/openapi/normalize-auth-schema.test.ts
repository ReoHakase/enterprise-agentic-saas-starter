import { describe, expect, it } from "vitest"

import { normalizeAuthOpenApiSchema } from "./normalize-auth-schema"

describe("normalizeAuthOpenApiSchema", () => {
  it("converts nullable OpenAPI 3.1 types to OpenAPI 3.0", () => {
    expect(
      normalizeAuthOpenApiSchema({
        type: ["string", "null"],
      })
    ).toEqual({
      nullable: true,
      type: "string",
    })
  })

  it("wraps ref siblings in allOf", () => {
    expect(
      normalizeAuthOpenApiSchema({
        $ref: "#/components/schemas/User",
        description: "Authenticated user",
      })
    ).toEqual({
      allOf: [
        { $ref: "#/components/schemas/User" },
        { description: "Authenticated user" },
      ],
    })
  })

  it("rejects nullable unions that OpenAPI 3.0 cannot represent", () => {
    expect(() =>
      normalizeAuthOpenApiSchema({
        type: ["string", "number", "null"],
      })
    ).toThrow("cannot be represented")
  })
})
