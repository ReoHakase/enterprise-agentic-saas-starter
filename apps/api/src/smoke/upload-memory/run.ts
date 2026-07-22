import { mkdtemp, open, readFile, rm } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  LOCAL_WORKERD_RSS_LIMITATION,
  parseConcurrency,
  parseProcessRows,
  summarizeProcessMemory,
  UPLOAD_MEMORY_SMOKE_FILE_BYTES,
  type ProcessMemorySample,
} from "./metrics"

const apiRoot = fileURLToPath(new URL("../../../", import.meta.url))
const WORKER_START_TIMEOUT_MS = 120_000
const REQUEST_TIMEOUT_MS = 60_000
const SAMPLE_INTERVAL_MS = 20
const PROCESS_STOP_TIMEOUT_MS = 5_000
let currentStage = "configuration"

type WorkerProcess = ReturnType<typeof Bun.spawn>
let activeWorker: WorkerProcess | undefined
const activeUploads = new Set<WorkerProcess>()

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

const allocateLoopbackPort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        server.close()
        reject(new Error("Could not allocate a loopback port."))
        return
      }
      server.close((cause) => {
        if (cause) reject(cause)
        else resolve(address.port)
      })
    })
  })

const signalProcessGroup = (child: WorkerProcess, signal: NodeJS.Signals) => {
  try {
    process.kill(-child.pid, signal)
  } catch (cause) {
    if (
      !cause ||
      typeof cause !== "object" ||
      !("code" in cause) ||
      cause.code !== "ESRCH"
    ) {
      throw cause
    }
  }
}

const stopProcess = async (child: WorkerProcess) => {
  if (child.exitCode !== null) return
  signalProcessGroup(child, "SIGTERM")
  const stopped = await Promise.race([
    child.exited.then(() => true),
    delay(PROCESS_STOP_TIMEOUT_MS).then(() => false),
  ])
  if (!stopped && child.exitCode === null) {
    signalProcessGroup(child, "SIGKILL")
    const killed = await Promise.race([
      child.exited.then(() => true),
      delay(1_000).then(() => false),
    ])
    if (!killed) throw new Error("Local Wrangler process group did not stop.")
  }
}

const waitForWorker = async (child: WorkerProcess, endpoint: string) => {
  const deadline = Date.now() + WORKER_START_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error("Local Wrangler exited before becoming ready.")
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- readiness polling is bounded.
      const response = await fetch(new URL("/health", endpoint), {
        signal: AbortSignal.timeout(750),
      })
      // oxlint-disable-next-line no-await-in-loop -- release each readiness response.
      await response.body?.cancel()
      if (response.status === 204) return
    } catch {
      // 起動中のconnection failureはdeadlineまで再試行する。
    }
    // oxlint-disable-next-line no-await-in-loop -- readiness polling is bounded.
    await delay(100)
  }
  throw new Error("Local Wrangler did not become ready in time.")
}

const readProcessMemory = (rootPid: number): ProcessMemorySample => {
  const processTable = Bun.spawnSync(["ps", "-axo", "pid=,ppid=,rss=,comm="], {
    stderr: "ignore",
    stdout: "pipe",
  })
  if (processTable.exitCode !== 0) {
    throw new Error("Could not read the local process table.")
  }
  return summarizeProcessMemory(
    parseProcessRows(new TextDecoder().decode(processTable.stdout)),
    rootPid
  )
}

const findWorkerdBaseline = async (rootPid: number) => {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const sample = readProcessMemory(rootPid)
    if (sample.workerdPids.length > 0) return sample
    // oxlint-disable-next-line no-await-in-loop -- child discovery is bounded.
    await delay(50)
  }
  throw new Error("Could not find workerd below the local Wrangler process.")
}

const createPayloadFile = async (path: string) => {
  const file = await open(path, "wx", 0o600)
  try {
    await file.truncate(UPLOAD_MEMORY_SMOKE_FILE_BYTES)
    await file.write(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      0,
      8,
      0
    )
  } finally {
    await file.close()
  }
}

type UploadResult =
  | { status: number; transportFailure: false }
  | { status: null; transportFailure: true }

const upload = async (
  endpoint: string,
  payloadPath: string,
  reportDirectory: string,
  sequence: number
): Promise<UploadResult> => {
  try {
    const headersPath = join(
      reportDirectory,
      `response-${sequence.toString()}.headers`
    )
    const child = Bun.spawn(
      [
        "curl",
        "--silent",
        "--show-error",
        "--output",
        "/dev/null",
        "--dump-header",
        headersPath,
        "--connect-timeout",
        "5",
        "--max-time",
        String(REQUEST_TIMEOUT_MS / 1000),
        "--header",
        "Expect:",
        "--form-string",
        `uploadId=${sequence.toString()}-${crypto.randomUUID()}`,
        "--form-string",
        `fileSize=${UPLOAD_MEMORY_SMOKE_FILE_BYTES.toString()}`,
        "--form",
        `file=@${payloadPath};type=image/png;filename=memory-smoke.png`,
        `${endpoint}/upload`,
      ],
      {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      }
    )
    activeUploads.add(child)
    const exitCode = await child.exited.finally(() => {
      activeUploads.delete(child)
    })
    const headers = await readFile(headersPath, "utf8").catch(() => "")
    const status = Number(
      [...headers.matchAll(/^HTTP\/\S+\s+(\d{3})/gmu)].at(-1)?.[1]
    )
    if (exitCode !== 0 || !Number.isInteger(status) || status === 0) {
      return { status: null, transportFailure: true }
    }
    return { status, transportFailure: false }
  } catch {
    return { status: null, transportFailure: true }
  }
}

const statusCounts = (results: UploadResult[]) => {
  const counts: Record<string, number> = {}
  for (const result of results) {
    const key = result.transportFailure
      ? "transport_failure"
      : String(result.status)
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

const run = async () => {
  currentStage = "configuration"
  const concurrency = parseConcurrency(process.argv.slice(2))
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "enterprise-agentic-saas-upload-memory-")
  )
  const payloadPath = join(temporaryDirectory, "payload.png")
  await createPayloadFile(payloadPath)
  const port = await allocateLoopbackPort()
  const endpoint = `http://127.0.0.1:${port.toString()}`
  const worker = Bun.spawn(
    [
      "./node_modules/.bin/wrangler",
      "dev",
      "--local",
      "--config",
      "src/smoke/upload-memory/wrangler.jsonc",
      "--persist-to",
      temporaryDirectory,
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--show-interactive-dev-session=false",
      "--log-level",
      "error",
    ],
    {
      cwd: apiRoot,
      detached: true,
      env: { ...process.env, CI: "1" },
      stdin: "ignore",
      stdout: "ignore",
      stderr: "inherit",
    }
  )
  activeWorker = worker

  let runFailure: unknown
  try {
    currentStage = "worker_start"
    await waitForWorker(worker, endpoint)
    currentStage = "workerd_discovery"
    const baseline = await findWorkerdBaseline(worker.pid)
    let peakWorkerdRssKiB = baseline.workerdRssKiB
    let peakSingleWorkerdRssKiB = baseline.workerdSingleProcessMaxRssKiB
    let peakProcessTreeRssKiB = baseline.processTreeRssKiB
    let peakWorkerdProcessCount = baseline.workerdPids.length
    let samples = 1
    let sampling = true
    let samplingFailed = false
    const sampler = (async () => {
      for (;;) {
        if (!sampling) break
        try {
          const sample = readProcessMemory(worker.pid)
          peakWorkerdRssKiB = Math.max(peakWorkerdRssKiB, sample.workerdRssKiB)
          peakSingleWorkerdRssKiB = Math.max(
            peakSingleWorkerdRssKiB,
            sample.workerdSingleProcessMaxRssKiB
          )
          peakWorkerdProcessCount = Math.max(
            peakWorkerdProcessCount,
            sample.workerdPids.length
          )
          peakProcessTreeRssKiB = Math.max(
            peakProcessTreeRssKiB,
            sample.processTreeRssKiB
          )
          samples += 1
        } catch {
          samplingFailed = true
        }
        // oxlint-disable-next-line no-await-in-loop -- fixed-rate RSS sampling.
        await delay(SAMPLE_INTERVAL_MS)
      }
    })()

    currentStage = "upload"
    const startedAt = performance.now()
    const results = await Promise.all(
      Array.from({ length: concurrency }, (_, index) =>
        upload(endpoint, payloadPath, temporaryDirectory, index)
      )
    )
    await delay(250)
    const durationMs = Math.round(performance.now() - startedAt)
    sampling = false
    await sampler

    const succeeded = results.filter(
      (result) => !result.transportFailure && result.status === 204
    ).length
    const failed = results.length - succeeded
    currentStage = "report"
    const report = {
      kind: "local-workerd-upload-memory-smoke",
      fileBytes: UPLOAD_MEMORY_SMOKE_FILE_BYTES,
      multipartRequests: concurrency,
      succeeded,
      failed,
      statusCounts: statusCounts(results),
      durationMs,
      rss: {
        unit: "KiB",
        baselineOwnedWorkerdAggregate: baseline.workerdRssKiB,
        peakSingleWorkerdProcess: peakSingleWorkerdRssKiB,
        peakOwnedWorkerdAggregate: peakWorkerdRssKiB,
        peakOwnedWorkerdProcessCount: peakWorkerdProcessCount,
        peakWranglerProcessTree: peakProcessTreeRssKiB,
        samples,
        samplingFailed,
      },
      limitation: LOCAL_WORKERD_RSS_LIMITATION,
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    if (failed > 0 || samplingFailed || peakWorkerdRssKiB === 0) {
      process.exitCode = 1
    }
  } catch (cause) {
    runFailure = cause
  }

  const failedStage = currentStage
  try {
    await stopProcess(worker)
    await rm(temporaryDirectory, { force: true, recursive: true })
    activeWorker = undefined
    currentStage = failedStage
  } catch {
    activeWorker = undefined
    currentStage = "cleanup"
    throw new Error("Upload memory smoke cleanup failed.")
  }
  if (runFailure) throw runFailure
}

if (import.meta.main) {
  let receivedSignal: "SIGINT" | "SIGTERM" | undefined
  const stopForSignal = (signal: "SIGINT" | "SIGTERM") => {
    receivedSignal = signal
    for (const uploadProcess of activeUploads) uploadProcess.kill("SIGTERM")
    if (activeWorker) {
      try {
        signalProcessGroup(activeWorker, "SIGTERM")
      } catch {
        // main cleanupがsanitized failureとして処理する。
      }
    }
  }
  const interrupt = () => stopForSignal("SIGINT")
  const terminate = () => stopForSignal("SIGTERM")
  process.once("SIGINT", interrupt)
  process.once("SIGTERM", terminate)
  try {
    await run()
  } catch {
    console.error(
      `Upload memory smoke failed before producing a complete sanitized report (stage=${currentStage}).`
    )
    process.exitCode = 1
  } finally {
    process.off("SIGINT", interrupt)
    process.off("SIGTERM", terminate)
    if (receivedSignal) {
      process.exitCode = receivedSignal === "SIGINT" ? 130 : 143
    }
  }
}
