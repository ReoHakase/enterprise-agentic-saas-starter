import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import { describe, expect, test } from "vitest"

const listFiles = async (
  directory: string,
  extension: RegExp
): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const filePath = path.join(directory, entry.name)
        if (
          entry.isDirectory() &&
          ![".next", ".turbo", "coverage", "dist", "node_modules"].includes(
            entry.name
          )
        ) {
          return listFiles(filePath, extension)
        }
        return entry.isFile() && extension.test(entry.name) ? [filePath] : []
      })
    )
  ).flat()
}

describe("repository quality configuration", () => {
  test("pins every remote GitHub Action to a full commit SHA", async () => {
    const files = await listFiles(".github", /\.ya?ml$/)
    const findings: string[] = []
    const contents = await Promise.all(
      files.map(async (filePath) => ({
        content: await readFile(filePath, "utf8"),
        filePath,
      }))
    )
    for (const { content, filePath } of contents) {
      for (const match of content.matchAll(/^\s*uses:\s*([^\s#]+)/gm)) {
        const reference = match[1]
        if (
          reference &&
          !reference.startsWith("./") &&
          !reference.startsWith("docker://") &&
          !/^[^@\s]+@[0-9a-f]{40}$/.test(reference)
        ) {
          findings.push(`${filePath}:${reference}`)
        }
      }
    }
    expect(findings).toEqual([])
  })
})
