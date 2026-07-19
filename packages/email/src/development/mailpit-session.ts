import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const emailRoot = fileURLToPath(new URL("../../", import.meta.url))
const developmentDirectory = `${emailRoot}.local`
export const mailpitDevelopmentSessionPath = `${developmentDirectory}/mailpit-session.json`

const localHostnames = new Set(["127.0.0.1", "localhost", "::1", "[::1]"])
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_RETRY_INTERVAL_MS = 100
const REQUEST_TIMEOUT_MS = 1_000

export type MailpitDevelopmentSession = {
  mode: "local"
  token: string
  url: string
}

type Fetcher = (
  input: Request | string | URL,
  init?: RequestInit
) => Promise<Response>

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

export const parseMailpitDevelopmentSession = (
  value: unknown
): MailpitDevelopmentSession => {
  if (!value || typeof value !== "object") {
    throw new Error("The local Mailpit session is invalid.")
  }

  const mode = Reflect.get(value, "mode")
  const token = Reflect.get(value, "token")
  const rawUrl = Reflect.get(value, "url")
  if (mode !== "local" || typeof token !== "string" || token.length < 32) {
    throw new Error("The local Mailpit session is invalid.")
  }

  try {
    if (typeof rawUrl !== "string") throw new Error("invalid URL")
    const url = new URL(rawUrl)
    if (
      url.protocol !== "http:" ||
      !localHostnames.has(url.hostname.toLowerCase()) ||
      !url.port ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error("invalid URL")
    }
    return { mode, token, url: url.origin }
  } catch {
    throw new Error("The local Mailpit session is invalid.")
  }
}

export const readMailpitDevelopmentSession = async () =>
  parseMailpitDevelopmentSession(
    JSON.parse(await readFile(mailpitDevelopmentSessionPath, "utf8"))
  )

export const writeMailpitDevelopmentSession = async (url: string) => {
  const session = parseMailpitDevelopmentSession({
    mode: "local",
    token: `${crypto.randomUUID()}${crypto.randomUUID()}`,
    url,
  })
  await mkdir(developmentDirectory, { mode: 0o700, recursive: true })
  await chmod(developmentDirectory, 0o700)
  await writeFile(
    mailpitDevelopmentSessionPath,
    `${JSON.stringify(session)}\n`,
    { encoding: "utf8", mode: 0o600 }
  )
  await chmod(mailpitDevelopmentSessionPath, 0o600)
  return session
}

export const removeMailpitDevelopmentSession = async (token: string) => {
  try {
    const current = await readMailpitDevelopmentSession()
    if (current.token === token) {
      await rm(mailpitDevelopmentSessionPath, { force: true })
    }
  } catch {
    // Missingまたは別processのsessionは削除しない。
  }
}

export const waitForMailpitDevelopmentSession = async ({
  fetcher = fetch,
  readSession = readMailpitDevelopmentSession,
  retryIntervalMs = DEFAULT_RETRY_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  fetcher?: Fetcher
  readSession?: () => Promise<MailpitDevelopmentSession>
  retryIntervalMs?: number
  timeoutMs?: number
} = {}) => {
  const deadline = Date.now() + Math.max(0, timeoutMs)

  while (Date.now() < deadline) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- readiness retries must remain sequential.
      const session = await readSession()
      const controller = new AbortController()
      const requestTimeout = setTimeout(
        () => controller.abort(),
        Math.min(REQUEST_TIMEOUT_MS, Math.max(0, deadline - Date.now()))
      )
      try {
        // oxlint-disable-next-line no-await-in-loop -- one local endpoint is probed at a time.
        const response = await fetcher(new URL("/api/v1/info", session.url), {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        })
        // oxlint-disable-next-line no-await-in-loop -- discard each sequential readiness response.
        await response.body?.cancel()
        if (response.ok) return session
      } finally {
        clearTimeout(requestTimeout)
      }
    } catch {
      // Missing/stale session or a server still starting is retried without raw errors.
    }

    // oxlint-disable-next-line no-await-in-loop -- retry delay protects local startup.
    await delay(
      Math.min(Math.max(0, retryIntervalMs), Math.max(0, deadline - Date.now()))
    )
  }

  throw new Error(
    "Local Mailpit did not become ready. Start the API through `bun run dev` or filtered Turbo so its email dependency runs."
  )
}
