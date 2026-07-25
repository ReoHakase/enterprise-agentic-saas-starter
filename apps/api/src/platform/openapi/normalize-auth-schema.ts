type JsonObject = { [key: string]: JsonValue }
type JsonValue = JsonObject | JsonValue[] | boolean | number | string | null

/**
 * Better Auth generates OpenAPI 3.1 nullable types while Elysia emits
 * OpenAPI 3.0.3. Normalize the generated fragment before merging so the
 * unified document does not mix incompatible schema dialects.
 */
export const normalizeAuthOpenApiSchema = (value: unknown): JsonValue => {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(normalizeAuthOpenApiSchema)
  }
  if (typeof value !== "object") {
    throw new TypeError("Better Auth OpenAPI contains a non-JSON value")
  }

  const normalized = Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) =>
      item === undefined ? [] : [[key, normalizeAuthOpenApiSchema(item)]]
    )
  )
  const type = normalized.type
  if (Array.isArray(type) && type.includes("null")) {
    const nonNullTypes = type.filter((item) => item !== "null")
    if (nonNullTypes.length !== 1 || typeof nonNullTypes[0] !== "string") {
      throw new TypeError(
        "Better Auth OpenAPI nullable type cannot be represented in OpenAPI 3.0"
      )
    }
    normalized.type = nonNullTypes[0]
    normalized.nullable = true
  }

  const reference = normalized.$ref
  if (typeof reference === "string" && Object.keys(normalized).length > 1) {
    const siblings = Object.fromEntries(
      Object.entries(normalized).filter(([key]) => key !== "$ref")
    )
    return {
      allOf: [{ $ref: reference }, siblings],
    }
  }

  return normalized
}
