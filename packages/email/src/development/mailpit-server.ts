import { spawn } from "node:child_process"
import { chmod, mkdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { writeMailpitDevelopmentSession } from "./mailpit-session"

const emailRoot = fileURLToPath(new URL("../../", import.meta.url))

const main = async () => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Local Mailpit cannot run in production.")
  }

  const host = process.env.HOST?.trim() || "127.0.0.1"
  const port = Number(process.env.PORT)
  if (
    (host !== "127.0.0.1" && host !== "localhost") ||
    !Number.isSafeInteger(port) ||
    port < 1 ||
    port > 65_535
  ) {
    throw new Error("Portless did not provide a valid loopback Mailpit port.")
  }

  const developmentDirectory = `${emailRoot}.local`
  await mkdir(developmentDirectory, { mode: 0o700, recursive: true })
  await chmod(developmentDirectory, 0o700)

  const mailpit = spawn(
    "mailpit",
    [
      "--listen",
      `${host}:${port.toString()}`,
      "--smtp",
      "127.0.0.1:0",
      "--database",
      ".local/mailpit.db",
      "--disable-version-check",
    ],
    { cwd: emailRoot, env: process.env, stdio: "inherit" }
  )
  const exited = new Promise<number>((resolve, reject) => {
    mailpit.once("error", reject)
    mailpit.once("exit", (code, signal) =>
      resolve(code ?? (signal === "SIGINT" ? 130 : 1))
    )
  })
  const forwardInterrupt = () => mailpit.kill("SIGINT")
  const forwardTerminate = () => mailpit.kill("SIGTERM")
  process.once("SIGINT", forwardInterrupt)
  process.once("SIGTERM", forwardTerminate)

  let cleanupSession: (() => Promise<void>) | undefined
  try {
    const session = await writeMailpitDevelopmentSession(
      `http://${host}:${port.toString()}`
    )
    cleanupSession = session.cleanup
    process.exitCode = await exited
  } finally {
    process.off("SIGINT", forwardInterrupt)
    process.off("SIGTERM", forwardTerminate)
    mailpit.kill()
    await cleanupSession?.()
  }
}

await main()
