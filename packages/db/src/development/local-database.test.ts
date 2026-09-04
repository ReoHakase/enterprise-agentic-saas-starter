import { describe, expect, it } from "vitest"

import {
  assertLocalDatabaseUrl,
  assertRepositoryLocalTursoUrl,
} from "./local-database"

describe("local DBの安全境界", () => {
  it("local開発DBのURLを許可してremote file hostを拒否する", () => {
    expect(() => assertLocalDatabaseUrl("file::memory:")).not.toThrow()
    expect(() =>
      assertLocalDatabaseUrl("https://db.example.localhost")
    ).not.toThrow()
    expect(() =>
      assertLocalDatabaseUrl("file://storage.example.com/shared.db")
    ).toThrow(/restricted to file: databases and localhost/i)
  })

  it("repository管理のPortless Tursoだけをreset対象として調整する", () => {
    expect(() =>
      assertRepositoryLocalTursoUrl(
        "https://db.enterprise-agentic-saas.localhost"
      )
    ).not.toThrow()
    expect(() =>
      assertRepositoryLocalTursoUrl(
        "https://db.feature-auth.enterprise-agentic-saas.localhost:7443"
      )
    ).not.toThrow()

    for (const databaseUrl of [
      "file:/tmp/custom.db",
      "http://127.0.0.1:8080",
      "https://other.localhost",
      "https://db.enterprise-agentic-saas.localhost/other",
    ]) {
      expect(() => assertRepositoryLocalTursoUrl(databaseUrl)).toThrow(
        /repository-managed Portless Turso/i
      )
    }
  })
})
