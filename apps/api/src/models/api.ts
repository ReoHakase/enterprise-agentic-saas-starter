import * as v from "valibot"

import { httpErrorCodes } from "../errors/http-error"

const errorCodeModel = v.pipe(
  v.picklist(httpErrorCodes),
  v.metadata({
    description:
      "Stable machine-readable error code used to select a documented recovery path.",
    examples: ["unauthorized", "step_up_required", "csrf_origin_forbidden"],
  })
)

const errorMessageModel = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(500),
  v.metadata({
    description:
      "Bounded application-owned message that is safe to present to the requester.",
    examples: ["Recent authentication is required."],
  })
)

const fieldErrorsModel = v.pipe(
  v.record(
    v.string(),
    v.pipe(v.array(errorMessageModel), v.minLength(1), v.maxLength(20))
  ),
  v.metadata({
    description:
      "Application-owned validation messages keyed by a bounded input field path.",
    examples: [{ title: ["Invalid value."] }],
  })
)

export const errorResponseModel = v.pipe(
  v.object({
    error: errorCodeModel,
    message: errorMessageModel,
    fieldErrors: v.optional(fieldErrorsModel),
  }),
  v.metadata({
    title: "ApiError",
    description:
      "Application error response containing a stable code and requester-safe explanation; request correlation and retry guidance use HTTP headers.",
    examples: [
      {
        error: "step_up_required",
        message: "Recent authentication is required.",
      },
    ],
  })
)

export const healthResponseModel = v.object({ status: v.literal("ok") })
export const readinessResponseModel = v.object({ status: v.literal("ready") })

export const authenticatedErrorResponses = {
  401: errorResponseModel,
  403: errorResponseModel,
  500: errorResponseModel,
} as const

export const tenantErrorResponses = {
  400: errorResponseModel,
  401: errorResponseModel,
  403: errorResponseModel,
  404: errorResponseModel,
  409: errorResponseModel,
  500: errorResponseModel,
} as const

type SecurityRequirement = Record<string, string[]>

export const sessionCookieSecurity: SecurityRequirement[] = [
  { sessionCookie: [] },
]
