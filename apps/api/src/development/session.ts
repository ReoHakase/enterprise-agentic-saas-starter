import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import { fileURLToPath } from "node:url"

const apiRoot = fileURLToPath(new URL("../../", import.meta.url))
const developmentRuntimeDirectory = `${apiRoot}.wrangler/development`
export const developmentSeedSessionPath = `${developmentRuntimeDirectory}/file-seed-session.json`
export const developmentLeaseDatabasePath = `${developmentRuntimeDirectory}/leases.db`

export const createDevelopmentRuntimeEnvPath = () =>
  `${developmentRuntimeDirectory}/runtime-${crypto.randomUUID()}.env`

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

export const writeDevelopmentSeedSession = async (
  session: DevelopmentSeedSession
) => {
  const temporaryPath = `${developmentSeedSessionPath}.${crypto.randomUUID()}.tmp`
  try {
    await writePrivateFile(
      temporaryPath,
      `${JSON.stringify(parseDevelopmentSeedSession(session))}\n`
    )
    await rename(temporaryPath, developmentSeedSessionPath)
    await chmod(developmentSeedSessionPath, 0o600)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

/** 別processが公開したsessionを消さないtoken-fenced cleanup。 */
export const removeDevelopmentSeedSessionIfOwned = async (token: string) => {
  let session: DevelopmentSeedSession
  try {
    session = await readDevelopmentSeedSession()
  } catch {
    return
  }
  if (session.token === token) {
    await rm(developmentSeedSessionPath, { force: true })
  }
}

/** Worker lease取得後だけ呼び、crashした旧supervisorのsecret envを回収する。 */
export const removeStaleDevelopmentRuntimeEnvFiles = async () => {
  let entries: string[]
  try {
    entries = await readdir(developmentRuntimeDirectory)
  } catch (cause) {
    if (cause instanceof Error && Reflect.get(cause, "code") === "ENOENT") {
      return
    }
    throw cause
  }
  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry === "runtime.env" ||
          /^runtime-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.env$/u.test(
            entry
          )
      )
      .map((entry) =>
        rm(`${developmentRuntimeDirectory}/${entry}`, { force: true })
      )
  )
}
