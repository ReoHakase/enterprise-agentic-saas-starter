import { EdenFetchError } from "@enterprise-agentic-saas/api/client"

export const httpError = (
  status: number,
  code: string,
  details: {
    fieldErrors?: Record<string, string[]>
    message?: string
  } = {}
) => new EdenFetchError(status, { error: code, ...details })
