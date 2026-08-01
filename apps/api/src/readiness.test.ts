import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { afterEach, describe, expect, it } from "vitest"

import { createApp } from "./app"

describe("readiness endpoint", () => {
  let closeClient: (() => void) | undefined

  afterEach(() => closeClient?.())

  const setup = () => {
    const client = createClient({ url: ":memory:" })
    closeClient = () => client.close()
    return { app: createApp(drizzle(client, { schema })), client }
  }

  it("reports ready only after a database round trip", async () => {
    const { app } = setup()
    const response = await app.handle(new Request("http://localhost/ready"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: "ready" })
  })

  it("fails closed without exposing database details", async () => {
    const { app, client } = setup()
    client.close()
    closeClient = undefined

    const response = await app.handle(new Request("http://localhost/ready"))
    const payload = await response.json()

    expect(response.status).toBe(503)
    expect(payload).toMatchObject({
      error: "service_unavailable",
    })
    expect(JSON.stringify(payload)).not.toMatch(/libsql|database|closed/i)
  })
})
