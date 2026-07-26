import { openapi, type ElysiaOpenAPIConfig } from "@elysia/openapi"
import {
  generateAuthOpenApiSchema,
  type AuthOpenApiSchema,
} from "@enterprise-agentic-saas/auth/openapi"
import { toJsonSchema } from "@valibot/to-json-schema"
import { Elysia } from "elysia"

import { env } from "../env"
import { normalizeAuthOpenApiSchema } from "../openapi/normalize-auth-schema"

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
  Core: "Better Auth endpoints for sign-in, sessions, accounts, and email verification.",
  "Magic link":
    "Issues and verifies single-use magic links for passwordless authentication.",
  "Multi-session":
    "Lists, activates, and revokes account sessions retained by the same browser.",
  Organization:
    "Invitation-recipient endpoints for accepting or rejecting organization membership.",
  Passkey:
    "Registers, authenticates, lists, updates, and removes WebAuthn passkeys.",
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

const titleCasePath = (path: string): string =>
  path
    .split(/[^a-zA-Z0-9]+/u)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ")

const authOperationSummary = (method: string, path: string): string => {
  const action =
    method === "get"
      ? "Retrieve"
      : method === "delete"
        ? "Delete"
        : method === "patch" || method === "put"
          ? "Update"
          : "Complete"
  return `${action} ${titleCasePath(path)}`
}

const disabledAuthPathPattern =
  /^\/auth\/(?:change-password|forget-password|reset-password|set-password|sign-in\/email|sign-up\/email)(?:\/|$)/u

const authOperationClassifications = (path: string, operation: JsonObject) => {
  const security = Array.isArray(operation.security) ? operation.security : []
  const callback = /\/(?:callback|oauth2\/callback)(?:\/|$)/u.test(path)

  return {
    security,
    "x-route-status": disabledAuthPathPattern.test(path)
      ? "configured-disabled"
      : "enabled",
    "x-auth-context": callback
      ? "oauth-callback"
      : security.length > 0
        ? "session-cookie"
        : "none",
    "x-audience": path.includes("invitation")
      ? "invitation-recipient"
      : "general",
  }
}

const createAuthSecuritySchemes = (value: unknown): OpenApiSecuritySchemes => {
  const normalized = normalizeAuthOpenApiSchema(value)
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
      const normalizedPathItem = normalizeAuthOpenApiSchema(pathItem)
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
              ...authOperationClassifications(prefixedPath, value),
              operationId: authOperationId(key, prefixedPath),
              summary: authOperationSummary(key, prefixedPath),
              description:
                typeof value.description === "string"
                  ? `${value.description} This operation uses the generated Better Auth contract and returns bounded library errors without exposing session credentials.`
                  : `Better Auth handles this ${key.toUpperCase()} request for authentication or account recovery. The generated request and response schemas remain authoritative, and failures use the library error contract without exposing credentials.`,
              tags,
            },
          ]
        })
      )
      return [prefixedPath, documentedPathItem]
    })
  )
  const schemas = normalizeAuthOpenApiSchema(schema.components.schemas)
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
          `Better Auth ${shortName} plugin endpoints for supported authentication and account workflows.`,
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
          // Valibotのcross-field/URL checkはruntime validationの正本に残す。
          // JSON Schemaへ表現できないactionだけを落とし、route schema全体を欠落させない。
          ignoreActions: ["check", "check_items", "to_number", "trim"],
          overrideSchema: ({ valibotSchema }) => {
            if (valibotSchema.type === "file") {
              return { format: "binary", type: "string" }
            }
            if (valibotSchema.type === "custom") {
              return {
                description:
                  "Runtime-validates a bounded JSON value; the recursive size contract is not representable in OpenAPI 3.0.",
              }
            }
            return undefined
          },
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
          "Public API for a multi-tenant SaaS application. Better Auth uses Secure and HttpOnly session cookies, tenant routes validate active membership and roles, and mutations retain Origin and CSRF protection.",
      },
      servers: [
        {
          url: env.API_PUBLIC_URL,
          description:
            env.NODE_ENV === "production" ? "Production" : "Local development",
        },
      ],
      tags: [
        {
          name: "System",
          description:
            "Liveness, readiness, and operational endpoints for the public API.",
        },
        {
          name: "Users",
          description:
            "Current user profile and first-party console context operations.",
        },
        {
          name: "Sessions",
          description:
            "Lists and revokes authenticated user sessions across devices.",
        },
        {
          name: "Organizations",
          description:
            "Creates, reads, updates, deletes, and activates tenant organizations.",
        },
        {
          name: "Organization members",
          description:
            "Manages tenant members while enforcing roles and recent authentication for sensitive changes.",
        },
        {
          name: "Organization invitations",
          description:
            "Creates, resends, lists, and cancels time-limited organization invitations.",
        },
        {
          name: "Issues",
          description:
            "Creates and manages issues within the caller's active organization.",
        },
        {
          name: "Issue comments",
          description:
            "Lists and manages tenant-safe discussion attached to issues.",
        },
        {
          name: "Audit",
          description:
            "Reads append-only audit events for authorized organization members.",
        },
        {
          name: "Agent",
          description:
            "Manages first-party Agent conversations, approvals, permissions, and bounded usage projections.",
        },
        {
          name: "Files",
          description:
            "Uploads, previews, downloads, and deletes private tenant-scoped file objects.",
        },
        {
          name: "Profile images",
          description:
            "Uploads, reads, and removes canonical private profile images for users and organizations.",
        },
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
              "Secure and HttpOnly Better Auth session cookie. Production may use the __Secure- prefix, and Scalar uses the browser's same-origin cookie without persisting a copied credential.",
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
