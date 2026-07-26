import * as v from "valibot"

import { appErrorCodes } from "../errors/error-registry"

const errorCodeModel = v.pipe(
  v.picklist(appErrorCodes),
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
      "Bounded public message that is safe to present without exposing provider or tenant details.",
    examples: ["Authentication required"],
  })
)

const publicContextIdentifierModel = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(96),
  v.regex(/^[A-Za-z][A-Za-z0-9_.:-]*$/)
)

const publicContextNumberModel = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(Number.MAX_SAFE_INTEGER)
)

const publicContextModel = v.pipe(
  v.object({
    action: v.optional(publicContextIdentifierModel),
    constraint: v.optional(publicContextIdentifierModel),
    field: v.optional(publicContextIdentifierModel),
    maxAgeSeconds: v.optional(publicContextNumberModel),
    reason: v.optional(publicContextIdentifierModel),
    resource: v.optional(publicContextIdentifierModel),
    retryAfter: v.optional(publicContextNumberModel),
  }),
  v.metadata({
    description:
      "Allowlisted recovery context that never contains credentials, tenant identifiers, or provider payloads.",
  })
)

const fieldErrorsModel = v.pipe(
  v.record(
    v.string(),
    v.pipe(v.array(errorMessageModel), v.minLength(1), v.maxLength(20))
  ),
  v.metadata({
    description:
      "Safe validation messages keyed by input field without echoing submitted values or provider errors.",
    examples: [{ dueDate: ["Invalid value"] }],
  })
)

const requestIdModel = v.pipe(
  v.string(),
  v.regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
  v.metadata({
    description:
      "Request identifier used to correlate a support report with sanitized server telemetry.",
    examples: ["req_01JQ8YF2J7Q0J2X8R8S3Q9M6P4"],
  })
)

export const apiErrorModel = v.pipe(
  v.object({
    error: v.object({
      code: errorCodeModel,
      message: errorMessageModel,
      context: v.optional(publicContextModel),
      fieldErrors: v.optional(fieldErrorsModel),
      requestId: requestIdModel,
    }),
  }),
  v.metadata({
    title: "ApiError",
    description:
      "Common API error response that excludes stack traces, causes, credentials, cookies, and database connection details.",
    examples: [
      {
        error: {
          code: "step_up_required",
          message: "Recent authentication required",
          context: {
            action: "organization.transfer_super_admin",
            maxAgeSeconds: 900,
          },
          requestId: "req_01JQ8YF2J7Q0J2X8R8S3Q9M6P4",
        },
      },
    ],
  })
)

export const healthResponseModel = v.object({ status: v.literal("ok") })
export const readinessResponseModel = v.object({ status: v.literal("ready") })

export const authenticatedErrorResponses = {
  401: apiErrorModel,
  403: apiErrorModel,
  500: apiErrorModel,
} as const

export const tenantErrorResponses = {
  400: apiErrorModel,
  401: apiErrorModel,
  403: apiErrorModel,
  404: apiErrorModel,
  409: apiErrorModel,
  500: apiErrorModel,
} as const

export const invitationErrorResponses = {
  ...tenantErrorResponses,
  429: apiErrorModel,
} as const

type SecurityRequirement = Record<string, string[]>

export const sessionCookieSecurity: SecurityRequirement[] = [
  { sessionCookie: [] },
]
