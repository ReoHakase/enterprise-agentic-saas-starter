import { openapi } from "@elysia/openapi"
import { Elysia } from "elysia"

import { env } from "../env"

export const openApiPlugin = new Elysia({ name: "openapi" }).use(
  openapi({
    path: "/openapi",
    provider: "swagger-ui",
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
      externalDocs: {
        description: "Better Auth endpoint reference",
        url: `${env.API_PUBLIC_URL}/auth/reference`,
      },
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
        { name: "Todos", description: "issue相当のtenant-scoped todo" },
        { name: "Todo comments", description: "issue discussion" },
        { name: "Audit", description: "append-only organization audit event" },
      ],
      components: {
        securitySchemes: {
          sessionCookie: {
            type: "apiKey",
            in: "cookie",
            name: "better-auth.session_token",
            description:
              "Better AuthのSecure/HttpOnly session cookie。productionではcookie名に__Secure- prefixが付く場合がある。Swagger UIはbrowser cookieをcredentials付きで送信する。",
          },
        },
      },
    },
    swagger: {
      deepLinking: true,
      displayOperationId: true,
      displayRequestDuration: true,
      docExpansion: "list",
      filter: true,
      showCommonExtensions: true,
      tagsSorter: "alpha",
      tryItOutEnabled: true,
      withCredentials: true,
    },
  })
)
