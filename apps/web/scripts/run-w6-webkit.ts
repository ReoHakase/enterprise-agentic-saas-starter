import { spawn } from "node:child_process"

const webkitInternalError = "WebKit encountered an internal error"
const maxAttempts = process.env.CI ? 3 : 1

const runPlaywright = () =>
  new Promise<{ exitCode: number; output: string }>((resolve, reject) => {
    const env = { ...process.env }
    delete env.NO_COLOR

    const child = spawn(
      "node",
      [
        "node_modules/@playwright/test/cli.js",
        "test",
        "--config=playwright.app.config.ts",
        "--project=w6-webkit-representative",
        "--retries=0",
      ],
      {
        cwd: process.cwd(),
        env,
        stdio: ["inherit", "pipe", "pipe"],
      }
    )
    const output: Buffer[] = []

    child.stdout.on("data", (chunk: Buffer) => {
      output.push(chunk)
      process.stdout.write(chunk)
    })
    child.stderr.on("data", (chunk: Buffer) => {
      output.push(chunk)
      process.stderr.write(chunk)
    })
    child.once("error", reject)
    child.once("close", (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        output: Buffer.concat(output).toString("utf8"),
      })
    })
  })

const runWithRetry = async (attempt: number): Promise<number> => {
  const result = await runPlaywright()
  if (result.exitCode === 0) {
    return 0
  }

  const isRetryable =
    result.output.includes(webkitInternalError) && attempt < maxAttempts
  if (!isRetryable) {
    return result.exitCode
  }

  console.warn(
    `WebKit process failed with its known internal error; starting fresh process (${attempt + 1}/${maxAttempts}).`
  )
  return runWithRetry(attempt + 1)
}

process.exit(await runWithRetry(1))
