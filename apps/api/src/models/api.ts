import { t } from "elysia"

const publicContextValueModel = t.Union([t.String(), t.Number(), t.Boolean()])

export const apiErrorModel = t.Object(
  {
    error: t.Object({
      code: t.String({
        description: "機械判定に使う安定したエラーコード",
        examples: ["unauthorized", "step_up_required", "csrf_origin_forbidden"],
      }),
      message: t.String({
        description: "利用者へ表示できる安全なメッセージ",
        examples: ["Authentication required"],
      }),
      context: t.Optional(
        t.Record(t.String(), publicContextValueModel, {
          description: "secretを含まない、UIの復旧導線用context",
        })
      ),
      requestId: t.Nullable(
        t.String({
          description: "問い合わせとtraceの突合に使うrequest id",
          examples: ["req_01JQ8YF2J7Q0J2X8R8S3Q9M6P4"],
        })
      ),
    }),
  },
  {
    $id: "ApiError",
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
  }
)

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
