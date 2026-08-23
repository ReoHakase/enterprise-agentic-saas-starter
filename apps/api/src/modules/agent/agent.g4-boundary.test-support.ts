import { spawn, type ChildProcess } from "node:child_process"
import { createServer, type Server } from "node:http"
import { join, resolve } from "node:path"

import type { createAgentInternalApp } from "./internal-api"

const repositoryRoot = resolve(import.meta.dirname, "../../../../..")
export const migrationsFolder = join(repositoryRoot, "packages/db/drizzle-v3")
const inheritedEnvironment = Object.fromEntries(
  ["PATH", "HOME", "TMPDIR", "USER", "SHELL", "LANG", "LC_ALL"].flatMap(
    (name) => {
      const value = process.env[name]
      return value === undefined ? [] : [[name, value]]
    }
  )
)

export const startInternalApiServer = async (
  app: ReturnType<typeof createAgentInternalApp>
): Promise<{ server: Server; url: string }> => {
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Uint8Array[] = []
      for await (const chunk of incoming) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
      }
      const combinedBody = Buffer.concat(chunks)
      const body =
        combinedBody.length === 0
          ? undefined
          : combinedBody.buffer.slice(
              combinedBody.byteOffset,
              combinedBody.byteOffset + combinedBody.byteLength
            )
      const address = server.address()
      if (!address || typeof address === "string") {
        throw new Error("Internal API server address unavailable")
      }
      const headers = new Headers()
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value !== undefined) {
          headers.set(name, Array.isArray(value) ? value.join(", ") : value)
        }
      }
      const response = await app.handle(
        new Request(`http://127.0.0.1:${address.port}${incoming.url ?? "/"}`, {
          method: incoming.method,
          headers,
          body,
        })
      )
      outgoing.statusCode = response.status
      response.headers.forEach((value, name) => outgoing.setHeader(name, value))
      outgoing.end(Buffer.from(await response.arrayBuffer()))
    } catch {
      outgoing.statusCode = 500
      outgoing.end("Internal test host failure")
    }
  })
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => resolveListen())
  })
  const address = server.address()
  if (!address || typeof address === "string") {
    throw new Error("Internal API server address unavailable")
  }
  return { server, url: `http://127.0.0.1:${address.port}` }
}

export const startAgentHost = async ({
  internalApiUrl,
  storageUrl,
}: {
  internalApiUrl: string
  storageUrl: string
}): Promise<{ child: ChildProcess; url: string }> => {
  const child = spawn(
    "/usr/bin/env",
    [
      "-i",
      ...Object.entries(inheritedEnvironment).map(
        ([name, value]) => `${name}=${value}`
      ),
      `AGENT_G4_INTERNAL_API_URL=${internalApiUrl}`,
      `AGENT_G4_STORAGE_URL=${storageUrl}`,
      "bun",
      "--no-env-file",
      "run",
      "scripts/g4-memory-host.ts",
    ],
    {
      cwd: join(repositoryRoot, "apps/agent"),
      stdio: ["ignore", "pipe", "pipe"],
    }
  )
  child.stdout?.setEncoding("utf8")
  child.stderr?.setEncoding("utf8")
  let stdout = ""
  let stderr = ""
  child.stderr?.on("data", (chunk) => {
    stderr += chunk
  })
  return await new Promise((resolveHost, reject) => {
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error(`Agent G4 host start timed out: ${stderr}`))
    }, 10_000)
    child.once("error", (cause) => {
      clearTimeout(timeout)
      reject(cause)
    })
    child.once("exit", (code) => {
      clearTimeout(timeout)
      reject(new Error(`Agent G4 host exited (${code}): ${stderr}`))
    })
    child.stdout?.on("data", (chunk) => {
      stdout += chunk
      const match = stdout.match(/G4_HOST_URL=(http:\/\/[^\s]+)/)
      if (!match?.[1]) return
      clearTimeout(timeout)
      resolveHost({ child, url: match[1] })
    })
  })
}

export const closeServer = (server: Server) =>
  new Promise<void>((resolveClose, reject) => {
    server.close((cause) => {
      if (cause) {
        reject(cause)
        return
      }
      resolveClose()
    })
  })

export const stopChild = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null) return
  const exited = new Promise<void>((resolveExit) =>
    child.once("exit", () => resolveExit())
  )
  child.kill("SIGTERM")
  const graceful = await Promise.race([
    exited.then(() => true),
    new Promise<false>((resolveTimeout) =>
      setTimeout(() => resolveTimeout(false), 2_000)
    ),
  ])
  if (graceful) return
  child.kill("SIGKILL")
  await exited
}

export const readThrough = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  sentinel: string
) => {
  const decoder = new TextDecoder()
  const readNext = async (body: string): Promise<string> => {
    if (body.includes(sentinel)) return body
    const next = await reader.read()
    if (next.done) throw new Error(`SSE ended before ${sentinel}`)
    return readNext(body + decoder.decode(next.value, { stream: true }))
  }
  return { body: await readNext(""), decoder }
}

export const readRemaining = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder
) => {
  const readNext = async (body: string): Promise<string> => {
    const next = await reader.read()
    if (next.done) return body + decoder.decode()
    return readNext(body + decoder.decode(next.value, { stream: true }))
  }
  return readNext("")
}
