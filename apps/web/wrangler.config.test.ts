import { describe, expect, it } from "vitest"

import config from "./wrangler.jsonc?raw"

describe("Web Worker observability config", () => {
  it("Given private queryを含むrequest, When Cloudflareが観測する, Then query redactionを必須にする", () => {
    // Given: Invocation Logsとtraceを有効にするWeb Worker設定がある。
    // When / Then: アプリ内OTelとは別にCloudflare側でもqueryを除去する。
    expect(config).toMatch(
      /"observability"\s*:\s*\{[^}]*"redact_query_string"\s*:\s*true/u
    )
  })
})
