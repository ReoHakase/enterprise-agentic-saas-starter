import * as v from "valibot"

const publicContextValueModel = v.union([v.string(), v.number(), v.boolean()])

const errorCodeModel = v.pipe(
  v.string(),
  v.metadata({
    description: "機械判定に使う安定したエラーコード",
    examples: ["unauthorized", "step_up_required", "csrf_origin_forbidden"],
  })
)

const errorMessageModel = v.pipe(
  v.string(),
  v.metadata({
    description: "利用者へ表示できる安全なメッセージ",
    examples: ["Authentication required"],
  })
)

const publicContextModel = v.pipe(
  v.record(v.string(), publicContextValueModel),
  v.metadata({
    description: "secretを含まない、UIの復旧導線用context",
  })
)

const fieldErrorsModel = v.pipe(
  v.record(
    v.string(),
    v.pipe(v.array(v.string()), v.minLength(1), v.maxLength(20))
  ),
  v.metadata({
    description:
      "入力fieldごとの安全なエラー。入力値やproviderのraw errorは含めない。",
    examples: [{ dueDate: ["Invalid value"] }],
  })
)

const requestIdModel = v.pipe(
  v.string(),
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
      requestId: v.nullable(requestIdModel),
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

type SecurityRequirement = Record<string, string[]>

export const sessionCookieSecurity: SecurityRequirement[] = [
  { sessionCookie: [] },
]
