import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { parseConfigFileTextToJson } from "typescript"
import { describe, expect, it } from "vitest"

type WranglerConfig = {
  cache?: {
    enabled?: unknown
  }
  services?: unknown
  [key: string]: unknown
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

  it("keeps bootstrap identical except for outbound services", async () => {
    const [production, bootstrap] = await Promise.all([
      readConfig("wrangler.jsonc"),
      readConfig("wrangler.bootstrap.jsonc"),
    ])
    const { services, ...productionWithoutServices } = production

    expect(services).toEqual(expect.any(Array))
    expect(bootstrap).toEqual(productionWithoutServices)
  })
})
