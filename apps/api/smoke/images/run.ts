import { chmod, rm, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { runImagesSmokeClient } from "./client"
import { IMAGES_SMOKE_HEALTH_ROUTE } from "./protocol"

const smokeDirectory = dirname(fileURLToPath(import.meta.url))
const apiDirectory = resolve(smokeDirectory, "../..")
const configPath = resolve(apiDirectory, "wrangler.images-smoke.jsonc")
const envFilePath = resolve(apiDirectory, ".dev.vars.images-smoke")
const port = Number(process.env.IMAGES_SMOKE_PORT ?? "8791")

if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
  throw new Error("IMAGES_SMOKE_PORT_INVALID")
}

const createToken = (): string => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  )
}

const waitForRemoteWorker = async (
  baseUrl: string,
  token: string,
  processExited: Promise<number>
): Promise<void> => {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    const readiness = fetch(new URL(IMAGES_SMOKE_HEALTH_ROUTE, baseUrl), {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(2_000),
    }).catch(() => null)
    // oxlint-disable-next-line no-await-in-loop -- remote Workerのreadinessは逐次pollする。
    const result = await Promise.race([
      readiness,
      processExited.then(() => "exited" as const),
    ])

    if (result === "exited") throw new Error("IMAGES_SMOKE_WRANGLER_EXITED")
    if (result?.status === 204) return
    // oxlint-disable-next-line no-await-in-loop -- 各probeのbodyを解放してから次へ進む。
    await result?.body?.cancel()
    // oxlint-disable-next-line no-await-in-loop -- retry intervalでCloudflareとloopbackを過負荷にしない。
    await Bun.sleep(250)
  }

  throw new Error("IMAGES_SMOKE_WRANGLER_TIMEOUT")
}

const discardStream = async (
  stream: ReadableStream<Uint8Array>
): Promise<void> => {
  const reader = stream.getReader()
  try {
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- raw Wrangler outputを保持せず逐次破棄してpipeを詰まらせない。
      const result = await reader.read()
      if (result.done) return
    }
  } finally {
    reader.releaseLock()
  }
}

const spawnRemoteWorker = () =>
  Bun.spawn(
    [
      process.execPath,
      "run",
      "wrangler",
      "dev",
      "--remote",
      "--config",
      configPath,
      "--env-file",
      envFilePath,
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--log-level",
      "error",
    ],
    {
      cwd: apiDirectory,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    }
  )

const token = createToken()
let wrangler: ReturnType<typeof spawnRemoteWorker> | undefined
let wranglerOutputDrained: Promise<void[]> | undefined

const stopWrangler = () => {
  if (wrangler && !wrangler.killed) wrangler.kill("SIGTERM")
}

const baseUrl = `http://127.0.0.1:${port}`
try {
  await writeFile(envFilePath, `SMOKE_TOKEN=${token}\n`, {
    encoding: "utf8",
    mode: 0o600,
  })
  await chmod(envFilePath, 0o600)

  wrangler = spawnRemoteWorker()
  wranglerOutputDrained = Promise.all([
    discardStream(wrangler.stdout),
    discardStream(wrangler.stderr),
  ])
  process.once("SIGINT", stopWrangler)
  process.once("SIGTERM", stopWrangler)

  console.log(JSON.stringify({ event: "images_smoke_start" }))
  await waitForRemoteWorker(baseUrl, token, wrangler.exited)
  const result = await runImagesSmokeClient(baseUrl, token)
  console.log(JSON.stringify({ event: "images_smoke_passed", ...result }))
} catch (error) {
  const code =
    error instanceof Error && /^IMAGES_SMOKE_[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "IMAGES_SMOKE_FAILED"
  console.error(JSON.stringify({ event: "images_smoke_failed", code }))
  process.exitCode = 1
} finally {
  stopWrangler()
  try {
    await Promise.allSettled([
      wrangler?.exited ?? Promise.resolve(0),
      wranglerOutputDrained ?? Promise.resolve([]),
    ])
  } finally {
    await rm(envFilePath, { force: true })
    process.off("SIGINT", stopWrangler)
    process.off("SIGTERM", stopWrangler)
  }
}
