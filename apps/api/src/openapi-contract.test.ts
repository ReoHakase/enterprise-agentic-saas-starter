import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { describe, expect, it } from "vitest"

import { createApp } from "./app"

type JsonObject = Record<string, unknown>

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const requiredObject = (value: unknown, label: string): JsonObject => {
  if (!isObject(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  return value
}

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string`)
  }
  return value.replaceAll(/\s+/gu, " ").trim()
}

const requiredStringArray = (value: unknown, label: string): string[] => {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    throw new TypeError(`${label} must be a string array`)
  }
  return value
}

const requiredSetMember = (
  value: unknown,
  allowed: ReadonlySet<string>,
  label: string
): string => {
  const member = requiredString(value, label)
  if (!allowed.has(member)) {
    throw new TypeError(`${label} is unsupported`)
  }
  return member
}

const operationMethods = ["delete", "get", "patch", "post", "put"] as const
const routeStatuses = new Set(["configured-disabled", "enabled"])
const authContexts = new Set([
  "bearer",
  "none",
  "oauth-callback",
  "session-cookie",
])
const audiences = new Set([
  "first-party-web",
  "general",
  "invitation-recipient",
])
const japaneseScriptPattern = /[\u3040-\u30ff\u3400-\u9fff]/u
const placeholderPattern =
  /\b(?:TODO|TBD|placeholder)\b|Response for status|^(?:DELETE|GET|PATCH|POST|PUT)\s+auth\b/iu

const createOpenApiDocument = async (): Promise<JsonObject> => {
  const client = createClient({ url: "file::memory:" })
  try {
    const app = createApp(drizzle({ client, relations: schema.relations }))
    const response = await app.handle(
      new Request("http://localhost/openapi/json")
    )
    expect(response.status).toBe(200)
    return requiredObject(await response.json(), "OpenAPI document")
  } finally {
    client.close()
  }
}

describe("app-owned OpenAPI consumer contract", () => {
  it("does not merge Better Auth paths or components", async () => {
    const document = await createOpenApiDocument()
    const paths = requiredObject(document.paths, "paths")
    const components = requiredObject(document.components, "components")
    const securitySchemes = requiredObject(
      components.securitySchemes,
      "securitySchemes"
    )

    expect(document.openapi).toBe("3.0.3")
    expect(Object.keys(paths).some((path) => path.startsWith("/auth/"))).toBe(
      false
    )
    expect(Object.keys(securitySchemes)).toEqual(["sessionCookie"])
  })

  it("documents the maintenance response on every public Agent operation", async () => {
    const document = await createOpenApiDocument()
    const paths = requiredObject(document.paths, "paths")

    for (const [path, pathValue] of Object.entries(paths)) {
      if (!path.startsWith("/agent/")) continue
      const pathItem = requiredObject(pathValue, path)
      for (const method of operationMethods) {
        const operationValue = pathItem[method]
        if (operationValue === undefined) continue
        const operation = requiredObject(
          operationValue,
          `${method.toUpperCase()} ${path}`
        )
        const responses = requiredObject(
          operation.responses,
          `${method.toUpperCase()} ${path} responses`
        )
        expect(responses).toHaveProperty("503")
      }
    }
  })

  it("documents the canonical audit action and target type enums", async () => {
    // When: app-owned OpenAPI documentを生成する
    const document = await createOpenApiDocument()
    const paths = requiredObject(document.paths, "paths")
    const path = requiredObject(
      paths["/organizations/{organizationId}/audit-logs"],
      "audit log path"
    )
    const operation = requiredObject(path.get, "audit log GET")
    if (!Array.isArray(operation.parameters)) {
      throw new TypeError("audit log GET parameters must be an array")
    }
    const actionParameter = operation.parameters.find(
      (parameter) => isObject(parameter) && parameter.name === "action"
    )
    const actionParameterSchema = requiredObject(
      requiredObject(actionParameter, "audit action parameter").schema,
      "audit action parameter schema"
    )
    const responses = requiredObject(operation.responses, "audit responses")
    const successResponse = requiredObject(responses["200"], "audit 200")
    const content = requiredObject(successResponse.content, "audit 200 content")
    const responseSchema = requiredObject(
      requiredObject(content["application/json"], "audit JSON content").schema,
      "audit response schema"
    )
    const itemSchema = requiredObject(
      responseSchema.items,
      "audit response item schema"
    )
    const properties = requiredObject(
      itemSchema.properties,
      "audit response properties"
    )
    const actionProperty = requiredObject(
      properties.action,
      "audit action property"
    )
    const targetTypeProperty = requiredObject(
      properties.targetType,
      "audit target type property"
    )

    // Then: queryとresponseがDB正本のenumを公開する
    expect(
      requiredStringArray(actionParameterSchema.enum, "audit query actions")
    ).toEqual([...schema.auditActions])
    expect(
      requiredStringArray(actionProperty.enum, "audit response actions")
    ).toEqual([...schema.auditActions])
    expect(
      requiredStringArray(
        targetTypeProperty.enum,
        "audit response target types"
      )
    ).toEqual([...schema.auditTargetTypes])
  })

  it("documents every operation with English metadata and classifications", async () => {
    const document = await createOpenApiDocument()
    if (!Array.isArray(document.tags)) {
      throw new TypeError("tags must be an array")
    }
    const declaredTags = new Set(
      document.tags.flatMap((tag) => {
        if (!isObject(tag) || typeof tag.name !== "string") {
          return []
        }
        return [tag.name]
      })
    )
    const paths = requiredObject(document.paths, "paths")
    const operationIds = new Set<string>()

    for (const [path, pathValue] of Object.entries(paths)) {
      const pathItem = requiredObject(pathValue, path)
      for (const method of operationMethods) {
        const operationValue = pathItem[method]
        if (operationValue === undefined) {
          continue
        }
        const label = `${method.toUpperCase()} ${path}`
        const operation = requiredObject(operationValue, label)
        const operationId = requiredString(
          operation.operationId,
          `${label} operationId`
        )
        const summary = requiredString(operation.summary, `${label} summary`)
        const description = requiredString(
          operation.description,
          `${label} description`
        )
        const security = operation.security
        const operationTags = requiredStringArray(
          operation.tags,
          `${label} tags`
        )

        expect(
          operationIds.has(operationId),
          `${label} unique operationId`
        ).toBe(false)
        operationIds.add(operationId)
        expect(
          summary.length,
          `${label} summary length`
        ).toBeGreaterThanOrEqual(8)
        expect(summary, `${label} summary ASCII`).toMatch(/[A-Za-z]/u)
        expect(
          description.length,
          `${label} description length`
        ).toBeGreaterThanOrEqual(80)
        expect(summary, `${label} summary language`).not.toMatch(
          japaneseScriptPattern
        )
        expect(description, `${label} description language`).not.toMatch(
          japaneseScriptPattern
        )
        expect(summary, `${label} summary fallback`).not.toMatch(
          placeholderPattern
        )
        expect(description, `${label} description fallback`).not.toMatch(
          placeholderPattern
        )
        expect(Array.isArray(security), `${label} standard security`).toBe(true)
        requiredSetMember(
          operation["x-route-status"],
          routeStatuses,
          `${label} route status`
        )
        requiredSetMember(
          operation["x-auth-context"],
          authContexts,
          `${label} auth context`
        )
        requiredSetMember(
          operation["x-audience"],
          audiences,
          `${label} audience`
        )
        for (const tag of operationTags) {
          expect(declaredTags.has(tag), `${label} declared tag ${tag}`).toBe(
            true
          )
        }
      }
    }
  })
})
