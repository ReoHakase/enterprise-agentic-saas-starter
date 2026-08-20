import { HttpError } from "../../errors/http-error"
import { McpToolError } from "../contracts"

export const toMcpToolError = (cause: unknown): McpToolError => {
  let current: unknown = cause
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof McpToolError) return current
    if (current instanceof HttpError) {
      if (
        current.code === "conflict" ||
        current.code === "forbidden" ||
        current.code === "not_found" ||
        current.code === "rate_limited" ||
        current.code === "validation_error"
      ) {
        return new McpToolError(current.code)
      }
      if (current.code === "unauthorized") {
        return new McpToolError("forbidden")
      }
    }
    if (typeof current !== "object") break
    current = Reflect.get(current, "cause")
  }
  return new McpToolError("retryable_internal")
}
