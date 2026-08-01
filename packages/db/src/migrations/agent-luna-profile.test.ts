import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { describe, expect, it } from "vitest"

import { migrationsFolder } from "./helpers"

describe("database migrations: Luna Agent profile", () => {
  it("installs the run defaults and versioned fallback price", async () => {
    const client = createClient({ url: "file::memory:" })
    try {
      await migrate(drizzle(client), { migrationsFolder })
      const runColumns = await client.execute("pragma table_info(agent_runs)")
      const defaults = Object.fromEntries(
        runColumns.rows.map((column) => [column.name, column.dflt_value])
      )
      expect(defaults).toMatchObject({
        model_profile_id: "'openrouter-gpt-5.6-luna-xhigh'",
        context_window_token_count: "1050000",
        reserved_output_token_count: "4096",
      })
      const lunaPrice = await client.execute(
        "select provider,model,pricing_version,input_price_micros_per_million,cache_read_price_micros_per_million,cache_write_price_micros_per_million,output_price_micros_per_million,tier_threshold_token_count,tier_input_price_micros_per_million,tier_output_price_micros_per_million from agent_model_prices where id = 'price_openrouter_gpt_5_6_luna_2026_08_01'"
      )
      expect(lunaPrice.rows).toEqual([
        {
          provider: "openrouter",
          model: "openai/gpt-5.6-luna",
          pricing_version: "openai-2026-08-01",
          input_price_micros_per_million: 200_000,
          cache_read_price_micros_per_million: 20_000,
          cache_write_price_micros_per_million: 250_000,
          output_price_micros_per_million: 1_200_000,
          tier_threshold_token_count: 272_000,
          tier_input_price_micros_per_million: 400_000,
          tier_output_price_micros_per_million: 1_800_000,
        },
      ])
    } finally {
      client.close()
    }
  })
})
