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

describe("API WorkerのWrangler設定", () => {
  it("productionとbootstrapでWorkers Cachingを無効にする", async () => {
    const [production, bootstrap] = await Promise.all([
      readConfig("wrangler.jsonc"),
      readConfig("wrangler.bootstrap.jsonc"),
    ])

    expect(production.cache).toEqual({ enabled: false })
    expect(bootstrap.cache).toEqual({ enabled: false })
  })

  it("両deployment段階でprivate Images Workerをbindingする", async () => {
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

  it("Agent RPC binding以外のbootstrap設定をproductionと一致させる", async () => {
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
