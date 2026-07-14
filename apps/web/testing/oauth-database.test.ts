import { access, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"

import { afterEach, describe, expect, it } from "vitest"

import {
  createOAuthDatabasePath,
  parseOAuthDatabaseUrl,
  removeOAuthDatabaseFiles,
} from "../e2e/fixtures/oauth-database"

const databasePath = createOAuthDatabasePath(process.pid)
const databaseFiles = [
  databasePath,
  `${databasePath}-shm`,
  `${databasePath}-wal`,
]
const unrelatedFile = `${databasePath}-journal`

afterEach(async () => {
  await Promise.all(
    [...databaseFiles, unrelatedFile].map((path) => rm(path, { force: true }))
  )
})

describe("OAuth E2E database boundary", () => {
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "invalid process id %sを拒否する",
    (processId) => {
      expect(() => createOAuthDatabasePath(processId)).toThrow(
        "OAuth E2E requires a positive process identifier"
      )
    }
  )

  it("tmpdir外のdatabase pathを拒否する", async () => {
    const outsidePath = join(
      dirname(tmpdir()),
      "enterprise-agentic-saas-oauth-e2e-123.db"
    )

    await expect(removeOAuthDatabaseFiles(outsidePath)).rejects.toThrow(
      "OAuth E2E database path is outside its temporary boundary"
    )
  })

  it("固定pattern以外のdatabase pathを拒否する", async () => {
    await expect(
      removeOAuthDatabaseFiles(join(tmpdir(), "oauth-e2e.db"))
    ).rejects.toThrow(
      "OAuth E2E database path is outside its temporary boundary"
    )
  })

  it("file以外と不正なdatabase URLを拒否する", () => {
    expect(() =>
      parseOAuthDatabaseUrl("https://example.test/database.db")
    ).toThrow("OAuth E2E requires a valid file database URL")
    expect(() => parseOAuthDatabaseUrl("not a URL")).toThrow(
      "OAuth E2E requires a valid file database URL"
    )
  })

  it("run固有のDB、WAL、SHMだけを削除する", async () => {
    await Promise.all(
      [...databaseFiles, unrelatedFile].map((path) =>
        writeFile(path, "fixture")
      )
    )

    expect(parseOAuthDatabaseUrl(pathToFileURL(databasePath).href)).toBe(
      databasePath
    )
    await removeOAuthDatabaseFiles(databasePath)

    await Promise.all(
      databaseFiles.map((path) =>
        expect(access(path)).rejects.toMatchObject({ code: "ENOENT" })
      )
    )
    await expect(access(unrelatedFile)).resolves.toBeUndefined()
  })
})
