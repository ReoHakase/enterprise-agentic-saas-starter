import { vi } from "vitest"

// createApp tests stay independent from the server-only auth singleton and its
// Turso/env startup. packages/auth tests verify the real generated document.
vi.mock("@enterprise-agentic-saas/auth/openapi", () => ({
  generateAuthOpenApiSchema: async () => ({
    openapi: "3.1.1",
    info: {
      title: "Better Auth API",
      description: "Better Auth test fixture",
      version: "1.6.9",
    },
    components: {
      schemas: {
        AuthUser: {
          type: "object",
          properties: {
            displayName: { type: ["string", "null"] },
          },
        },
      },
      securitySchemes: {
        apiKeyCookie: {
          type: "apiKey",
          in: "cookie",
          name: "apiKeyCookie",
          description: "Better Auth cookie authentication",
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Better Auth bearer authentication",
        },
      },
    },
    security: [{ apiKeyCookie: [], bearerAuth: [] }],
    servers: [{ url: "http://api.localhost/auth" }],
    tags: [{ name: "Default", description: "Better Auth core routes" }],
    paths: {
      "/sign-in/magic-link": {
        post: {
          tags: ["Magic-link"],
          summary: undefined,
          description: "Send a magic link",
          responses: { 200: { description: "Success" } },
        },
      },
      "/passkey/generate-register-options": {
        get: {
          tags: ["Passkey"],
          description: "Generate passkey registration options",
          responses: {
            200: {
              description: "Success",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    $ref: "#/components/schemas/AuthUser",
                  },
                },
              },
            },
          },
        },
      },
      "/multi-session/list-device-sessions": {
        get: {
          tags: ["Multi-session"],
          responses: { 200: { description: "Success" } },
        },
      },
      "/organization/accept-invitation": {
        post: {
          tags: ["Organization"],
          description: "Accept an organization invitation",
          responses: { 200: { description: "Success" } },
        },
      },
      "/organization/list-user-invitations": {
        get: {
          tags: ["Organization"],
          description: "List organization invitations for the user",
          responses: { 200: { description: "Success" } },
        },
      },
    },
  }),
}))
