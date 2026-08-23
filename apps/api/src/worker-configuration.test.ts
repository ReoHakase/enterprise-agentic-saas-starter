import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { parseConfigFileTextToJson } from "typescript"
import { describe, expect, it } from "vitest"

type WranglerConfig = {
  cache?: {
    enabled?: unknown
  }
  services?: ServiceBinding[]
  [key: string]: unknown
}

type ServiceBinding = {
  binding?: unknown
  entrypoint?: unknown
  service?: unknown
}

const readConfig = async (fileName: string): Promise<WranglerConfig> => {
  const path = resolve(import.meta.dirname, "..", fileName)
  const parsed = parseConfigFileTextToJson(path, await readFile(path, "utf8"))
  if (parsed.error) throw new Error(`Failed to parse ${fileName}`)
  const config: WranglerConfig = parsed.config
  return config
}

describe("API Worker Wrangler configuration", () => {
  it("disables Workers Caching for production and bootstrap", async () => {
    const [production, bootstrap] = await Promise.all([
      readConfig("wrangler.jsonc"),
      readConfig("wrangler.bootstrap.jsonc"),
    ])

    expect(production.cache).toEqual({ enabled: false })
    expect(bootstrap.cache).toEqual({ enabled: false })
  })

  it("binds the private Images Worker in both deployment phases", async () => {
    const [production, bootstrap] = await Promise.all([
      readConfig("wrangler.jsonc"),
      readConfig("wrangler.bootstrap.jsonc"),
    ])
    const imagesBinding = {
      binding: "IMAGE_PREVIEWS",
      service: "enterprise-agentic-saas-images",
    }

    expect(production.services).toContainEqual(imagesBinding)
    expect(bootstrap.services).toEqual([imagesBinding])
  })

  it("keeps bootstrap identical except for the Agent RPC binding", async () => {
    const [production, bootstrap] = await Promise.all([
      readConfig("wrangler.jsonc"),
      readConfig("wrangler.bootstrap.jsonc"),
    ])
    const withoutAgentRuntime = {
      ...production,
      services: production.services?.filter(
        ({ binding }) => binding !== "AGENT_RUNTIME"
      ),
    }

    expect(production.services).toContainEqual({
      binding: "AGENT_RUNTIME",
      service: "enterprise-agentic-saas-agent",
      entrypoint: "AgentRuntime",
    })
    expect(bootstrap).toEqual(withoutAgentRuntime)
  })
})
