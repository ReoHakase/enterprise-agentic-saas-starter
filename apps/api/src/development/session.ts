import { chmod, mkdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const apiRoot = fileURLToPath(new URL("../../", import.meta.url))
export const developmentRuntimeDirectory = `${apiRoot}.wrangler/development`
export const developmentRuntimeEnvPath = `${developmentRuntimeDirectory}/runtime.env`
export const developmentSeedSessionPath = `${developmentRuntimeDirectory}/file-seed-session.json`

export type DevelopmentSeedSession = {
  endpoint: string
  mode: "local"
  token: string
}

export const writePrivateFile = async (path: string, contents: string) => {
  await mkdir(developmentRuntimeDirectory, { mode: 0o700, recursive: true })
  await chmod(developmentRuntimeDirectory, 0o700)
  await writeFile(path, contents, { encoding: "utf8", mode: 0o600 })
  // writeFileのmodeは既存fileを開いた場合にpermissionを変更しない。
  // crash後のstale fileを再利用してもtoken/envをgroupへ公開しないよう固定する。
  await chmod(path, 0o600)
}

export const parseDevelopmentSeedSession = (value: unknown) => {
  if (!value || typeof value !== "object") {
    throw new Error("The local API seed session is invalid.")
  }
  const endpoint = Reflect.get(value, "endpoint")
  const mode = Reflect.get(value, "mode")
  const token = Reflect.get(value, "token")
  if (
    typeof endpoint !== "string" ||
    !/^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+\/?$/u.test(endpoint) ||
    mode !== "local" ||
    typeof token !== "string" ||
    token.length < 32
  ) {
    throw new Error("The local API seed session is invalid.")
  }
  return { endpoint, mode, token } satisfies DevelopmentSeedSession
}

export const readDevelopmentSeedSession = async () => {
  const value: unknown = JSON.parse(
    await readFile(developmentSeedSessionPath, "utf8")
  )
  return parseDevelopmentSeedSession(value)
}
