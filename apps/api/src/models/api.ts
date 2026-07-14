import * as v from "valibot"

const errorCodeModel = v.pipe(
  v.string(),
  v.regex(/^[A-Za-z0-9_-]{1,64}$/),
  v.metadata({
    description: "機械判定に使う安定したエラーコード",
    examples: ["unauthorized", "step_up_required", "csrf_origin_forbidden"],
  })
)

const errorMessageModel = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(500),
  v.metadata({
    description: "利用者へ表示できる安全なメッセージ",
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
      "secretやtenant IDを含まない、allowlist済みのUI復旧導線用context",
  })
)

const fieldErrorsModel = v.pipe(
  v.record(
    v.string(),
    v.pipe(v.array(errorMessageModel), v.minLength(1), v.maxLength(20))
  ),
  v.metadata({
    description:
      "入力fieldごとの安全なエラー。入力値やproviderのraw errorは含めない。",
    examples: [{ dueDate: ["Invalid value"] }],
  })
)

const requestIdModel = v.pipe(
  v.string(),
  v.regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
  v.metadata({
    description: "問い合わせとtraceの突合に使うrequest id",
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
      "API共通エラー。stack、cause、token、cookie、DB接続情報は含めない。",
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
