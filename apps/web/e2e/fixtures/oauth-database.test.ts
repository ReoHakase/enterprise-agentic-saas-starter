import { access, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"

import { afterEach, describe, expect, it } from "vitest"

import {
  createOAuthDatabasePath,
  parseOAuthDatabaseUrl,
  removeOAuthDatabaseFiles,
} from "./oauth-database"

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

describe("OAuth E2Eデータベース境界", () => {
  it.each([
    { caseLabel: "ゼロ", processId: 0 },
    { caseLabel: "負数", processId: -1 },
    { caseLabel: "小数", processId: 1.5 },
    {
      caseLabel: "安全な整数の上限超過",
      processId: Number.MAX_SAFE_INTEGER + 1,
    },
  ])("$caseLabelのプロセスIDを拒否する", ({ processId }) => {
    expect(() => createOAuthDatabasePath(processId)).toThrow(
      "OAuth E2E requires a positive process identifier"
    )
  })

  it("一時ディレクトリ外のデータベースパスを拒否する", async () => {
    const outsidePath = join(
      dirname(tmpdir()),
      "enterprise-agentic-saas-oauth-e2e-123.db"
    )

    await expect(removeOAuthDatabaseFiles(outsidePath)).rejects.toThrow(
      "OAuth E2E database path is outside its temporary boundary"
    )
  })

  it("固定パターン外のデータベースパスを拒否する", async () => {
    await expect(
      removeOAuthDatabaseFiles(join(tmpdir(), "oauth-e2e.db"))
    ).rejects.toThrow(
      "OAuth E2E database path is outside its temporary boundary"
    )
  })

  it("file以外のデータベースURLを拒否する", () => {
    expect(() =>
      parseOAuthDatabaseUrl("https://example.test/database.db")
    ).toThrow("OAuth E2E requires a valid file database URL")
  })

  it("形式不正のデータベースURLを拒否する", () => {
    expect(() => parseOAuthDatabaseUrl("not a URL")).toThrow(
      "OAuth E2E requires a valid file database URL"
    )
  })

  it("fileデータベースURLを実行固有pathへ変換する", () => {
    expect(parseOAuthDatabaseUrl(pathToFileURL(databasePath).href)).toBe(
      databasePath
    )
  })

  it("実行固有のDB、WAL、SHMだけを削除する", async () => {
    await Promise.all(
      [...databaseFiles, unrelatedFile].map((path) =>
        writeFile(path, "fixture")
      )
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
