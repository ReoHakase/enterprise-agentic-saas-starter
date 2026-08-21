import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { parseConfigFileTextToJson } from "typescript"
import { describe, expect, it } from "vitest"

type WranglerConfig = {
  cache?: unknown
  compatibility_flags?: unknown
  images?: unknown
  preview_urls?: unknown
  r2_buckets?: unknown
  route?: unknown
  routes?: unknown
  workers_dev?: unknown
}

describe("Images Worker Wrangler configuration", () => {
  it("is private and enables caching only with the required bindings", async () => {
    const path = resolve(import.meta.dirname, "../wrangler.jsonc")
    const parsed = parseConfigFileTextToJson(path, await readFile(path, "utf8"))
    if (parsed.error) throw new Error("Failed to parse wrangler.jsonc")
    const config: WranglerConfig = parsed.config

    expect(config.workers_dev).toBe(false)
    expect(config.preview_urls).toBe(false)
    expect(config).not.toHaveProperty("compatibility_flags")
    expect(config).not.toHaveProperty("route")
    expect(config).not.toHaveProperty("routes")
    expect(config.cache).toEqual({ enabled: true })
    expect(config.r2_buckets).toEqual([
      {
        binding: "FILES",
        bucket_name: "enterprise-agentic-saas-attachments",
      },
    ])
    expect(config.images).toEqual({ binding: "IMAGES" })
  })
})
