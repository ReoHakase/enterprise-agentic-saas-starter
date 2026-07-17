import { openapi, type ElysiaOpenAPIConfig } from "@elysia/openapi"
import {
  generateAuthOpenApiSchema,
  type AuthOpenApiSchema,
} from "@enterprise-agentic-saas/auth/openapi"
import { toJsonSchema } from "@valibot/to-json-schema"
import { Elysia } from "elysia"

import { env } from "../env"

const HTTP_METHODS = new Set([
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
])

const AUTH_TAG_DESCRIPTIONS: Readonly<Record<string, string>> = {
  Core: "Better Authのsign-in、session、account、email verification endpoint。",
  "Magic link": "magic linkの発行と検証。",
  "Multi-session": "同一browserに保持したaccount sessionの一覧、切替、失効。",
  Organization: "招待recipient本人が使うorganization invitation endpoint。",
  Passkey: "passkeyの登録、認証、一覧、更新、削除。",
}

type OpenApiDocumentation = NonNullable<ElysiaOpenAPIConfig["documentation"]>
type OpenApiPaths = NonNullable<OpenApiDocumentation["paths"]>
type OpenApiSchemas = NonNullable<
  NonNullable<OpenApiDocumentation["components"]>["schemas"]
>
type OpenApiSecuritySchemes = NonNullable<
  NonNullable<OpenApiDocumentation["components"]>["securitySchemes"]
>

type JsonObject = { [key: string]: JsonValue }
type JsonValue = JsonObject | JsonValue[] | boolean | number | string | null

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isOpenApiPaths = (value: unknown): value is OpenApiPaths =>
  isJsonObject(value) &&
  Object.entries(value).every(
    ([path, pathItem]) => path.startsWith("/") && isJsonObject(pathItem)
  )

const isOpenApiSchemas = (value: unknown): value is OpenApiSchemas =>
  isJsonObject(value) &&
  Object.values(value).every((schema) => isJsonObject(schema))

/**
 * Better Auth 1.6 generates OpenAPI 3.1 nullable types while Elysia 1.4 emits
 * OpenAPI 3.0.3. Normalize the generated fragment before merging so the
 * unified document does not mix incompatible schema dialects.
 */
const normalizeOpenApi31Value = (value: unknown): JsonValue => {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(normalizeOpenApi31Value)
  }
  if (typeof value !== "object") {
    throw new TypeError("Better Auth OpenAPI contains a non-JSON value")
  }

  const normalized = Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) =>
      item === undefined ? [] : [[key, normalizeOpenApi31Value(item)]]
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

const normalizeAuthTag = (tag: string): string => {
  if (tag === "Default") {
    return "Auth / Core"
  }
  if (tag === "Magic-link") {
    return "Auth / Magic link"
  }
  return `Auth / ${tag}`
}

const authOperationId = (method: string, path: string): string =>
  `betterAuth${[method, ...path.split(/[^a-zA-Z0-9]+/u)]
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("")}`

const authOperationSummary = (method: string, path: string): string => {
  const resource = path
    .split("/")
    .filter(Boolean)
    .map((part) => part.replaceAll(/[-{}]/gu, " "))
    .join(" / ")
  return `${method.toUpperCase()} ${resource}`
}

const createAuthSecuritySchemes = (value: unknown): OpenApiSecuritySchemes => {
  const normalized = normalizeOpenApi31Value(value)
  if (!isJsonObject(normalized)) {
    throw new TypeError(
      "Better Auth OpenAPI security schemes must be an object"
    )
  }

  const securitySchemes: OpenApiSecuritySchemes = {}
  for (const [name, candidate] of Object.entries(normalized)) {
    if (!isJsonObject(candidate) || typeof candidate.type !== "string") {
      throw new TypeError("Better Auth OpenAPI security scheme is invalid")
    }
    const description =
      typeof candidate.description === "string"
        ? candidate.description
        : undefined

    if (
      candidate.type === "apiKey" &&
      typeof candidate.name === "string" &&
      (candidate.in === "cookie" ||
        candidate.in === "header" ||
        candidate.in === "query")
    ) {
      securitySchemes[name] = {
        type: "apiKey",
        in: candidate.in,
        name: candidate.name,
        description,
      }
      continue
    }
    if (candidate.type === "http" && typeof candidate.scheme === "string") {
      securitySchemes[name] = {
        type: "http",
        scheme: candidate.scheme,
        description,
      }
      continue
    }
    throw new TypeError(
      "Better Auth OpenAPI contains an unsupported security scheme"
    )
  }
  return securitySchemes
}

const createAuthOpenApiFragment = (schema: AuthOpenApiSchema) => {
  const authTags = new Set<string>()
  const paths = Object.fromEntries(
    Object.entries(schema.paths).map(([path, pathItem]) => {
      const prefixedPath = `/auth${path}`
      const normalizedPathItem = normalizeOpenApi31Value(pathItem)
      if (!isJsonObject(normalizedPathItem)) {
        throw new TypeError("Better Auth OpenAPI path item must be an object")
      }

      const documentedPathItem = Object.fromEntries(
        Object.entries(normalizedPathItem).map(([key, value]) => {
          if (!HTTP_METHODS.has(key) || !isJsonObject(value)) {
            return [key, value]
          }

          const tags = Array.isArray(value.tags)
            ? value.tags
                .filter((tag): tag is string => typeof tag === "string")
                .map(normalizeAuthTag)
            : ["Auth / Core"]
          for (const tag of tags) {
            authTags.add(tag)
          }

          return [
            key,
            {
              ...value,
              operationId: authOperationId(key, prefixedPath),
              summary: authOperationSummary(key, prefixedPath),
              description:
                typeof value.description === "string"
                  ? value.description
                  : `Better Authが提供する${key.toUpperCase()} ${prefixedPath} endpoint。`,
              tags,
            },
          ]
        })
      )
      return [prefixedPath, documentedPathItem]
    })
  )
  const schemas = normalizeOpenApi31Value(schema.components.schemas)
  if (!isOpenApiPaths(paths) || !isOpenApiSchemas(schemas)) {
    throw new TypeError("Better Auth OpenAPI paths and schemas are invalid")
  }

  return {
    paths,
    schemas,
    securitySchemes: createAuthSecuritySchemes(
      schema.components.securitySchemes
    ),
    tags: [...authTags].map((name) => {
      const shortName = name.replace("Auth / ", "")
      return {
        name,
        description:
          AUTH_TAG_DESCRIPTIONS[shortName] ??
          `Better Auth ${shortName} plugin endpoint。`,
      }
    }),
  }
}

const authOpenApi = createAuthOpenApiFragment(await generateAuthOpenApiSchema())

export const openApiPlugin = new Elysia({ name: "openapi" }).use(
  openapi({
    path: "/openapi",
    provider: "scalar",
    mapJsonSchema: {
      valibot: (schema: Parameters<typeof toJsonSchema>[0]) =>
        toJsonSchema(schema, {
          ignoreActions: ["to_number", "trim"],
          target: "openapi-3.0",
          typeMode: "output",
        }),
    },
    documentation: {
      openapi: "3.0.3",
      info: {
        title: `${env.APP_NAME} API`,
        version: "1.0.0",
        description:
          "Multi-tenant SaaS template API。認証はSecure/HttpOnlyなBetter Auth session cookie、tenant routeはactive organization・membership・roleをfail-closedで検証する。mutationではOrigin/CSRF保護を無効化しない。",
      },
      servers: [
        {
          url: env.API_PUBLIC_URL,
          description:
            env.NODE_ENV === "production" ? "Production" : "Local development",
        },
      ],
      tags: [
        { name: "System", description: "healthと運用確認" },
        { name: "Users", description: "現在のuser profileとconsole context" },
        { name: "Sessions", description: "user session管理" },
        {
          name: "Organizations",
          description: "organization作成・参照・active tenant切替",
        },
        {
          name: "Organization members",
          description:
            "member管理。role変更・削除・super_admin移管は権限とfresh sessionを強制する。",
        },
        {
          name: "Organization invitations",
          description: "期限付きorganization招待",
        },
        { name: "Issues", description: "tenant-scoped issue management" },
        { name: "Issue comments", description: "issue discussion" },
        { name: "Audit", description: "append-only organization audit event" },
        ...authOpenApi.tags,
      ],
      paths: authOpenApi.paths,
      components: {
        schemas: authOpenApi.schemas,
        securitySchemes: {
          ...authOpenApi.securitySchemes,
          sessionCookie: {
            type: "apiKey",
            in: "cookie",
            name: "better-auth.session_token",
            description:
              "Better AuthのSecure/HttpOnly session cookie。productionではcookie名に__Secure- prefixが付く場合がある。ScalarのAPI clientは同一originのbrowser cookieを使用する。",
          },
        },
      },
    },
    scalar: {
      agent: { disabled: true },
      defaultHttpClient: { targetKey: "js", clientKey: "fetch" },
      layout: "modern",
      persistAuth: false,
      showDeveloperTools: "never",
      showOperationId: true,
      telemetry: false,
      withDefaultFonts: false,
    },
  })
)
