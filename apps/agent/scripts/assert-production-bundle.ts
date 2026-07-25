import { readdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"

const SCRIPTED_MODEL_SENTINEL = "ENTERPRISE_AGENT_SCRIPTED_MODEL_SENTINEL_v1"
const outputDirectory = resolve(
  import.meta.dirname,
  process.argv[2] ?? "../dist/worker"
)

const JavaScriptExtensions = new Set([".cjs", ".js", ".mjs"])

const extensionOf = (path: string) => {
  const index = path.lastIndexOf(".")
  return index === -1 ? "" : path.slice(index)
}

const findJavaScriptFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return findJavaScriptFiles(path)
      return JavaScriptExtensions.has(extensionOf(path)) ? [path] : []
    })
  )
  return files.flat()
}

const files = await findJavaScriptFiles(outputDirectory)
if (files.length === 0) {
  throw new Error("Production Worker dry-run did not emit JavaScript")
}

const leakedFiles = (
  await Promise.all(
    files.map(async (file) => ({
      file,
      source: await readFile(file, "utf8"),
    }))
  )
).filter(({ source }) => source.includes(SCRIPTED_MODEL_SENTINEL))

if (leakedFiles.length > 0) {
  throw new Error(
    `Scripted model leaked into production bundle: ${leakedFiles
      .map(({ file }) => file)
      .join(", ")}`
  )
}
