import { openapi } from "@elysia/openapi"
import { toJsonSchema } from "@valibot/to-json-schema"
import { Elysia } from "elysia"

import { env } from "../env"

const scalarSources = [
  {
    title: `${env.APP_NAME} API`,
    slug: "application-api",
    url: "/openapi/json",
  },
  {
    title: `${env.APP_NAME} Authentication`,
    slug: "authentication-api",
    url: "/auth/open-api/generate-schema",
  },
] as const

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
          "Application-owned API for a multi-tenant SaaS product. Protected routes use Secure and HttpOnly Better Auth session cookies, validate active membership and roles, and retain Origin and CSRF protection.",
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
            "Lists and cancels time-limited organization invitations; Better Auth owns creation and resend operations.",
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
      ],
      components: {
        securitySchemes: {
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
      sources: scalarSources,
      telemetry: false,
      url: undefined,
      withDefaultFonts: false,
    },
  })
)
