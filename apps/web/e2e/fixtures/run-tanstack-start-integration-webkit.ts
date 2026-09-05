import { spawn } from "node:child_process"

export const webkitInternalError = "WebKit encountered an internal error"

type PlaywrightProcessResult = {
  exitCode: number
  output: string
}

type WebKitFreshProcessOptions = {
  maxAttempts: number
  runPlaywright: () => Promise<PlaywrightProcessResult>
  warn?: (message: string) => void
}

export const webkitMaxAttempts = (ci: string | undefined) => (ci ? 3 : 1)

export const isWebKitInternalError = (result: PlaywrightProcessResult) =>
  result.exitCode !== 0 && result.output.includes(webkitInternalError)

export const runWebKitWithFreshProcesses = async ({
  maxAttempts,
  runPlaywright,
  warn = console.warn,
}: WebKitFreshProcessOptions): Promise<number> => {
  const runAttempt = async (attempt: number): Promise<number> => {
    const result = await runPlaywright()
    if (result.exitCode === 0) return 0
    if (!isWebKitInternalError(result) || attempt === maxAttempts) {
      return result.exitCode
    }

    warn(
      `WebKit process failed with its known internal error; starting fresh process (${attempt + 1}/${maxAttempts}).`
    )
    return runAttempt(attempt + 1)
  }

  return runAttempt(1)
}

const runPlaywright = () =>
  new Promise<PlaywrightProcessResult>((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      WEB_PLAYWRIGHT_PROFILE: "app",
    }
    delete env.NO_COLOR

    const child = spawn(
      "node",
      [
        "node_modules/@playwright/test/cli.js",
        "test",
        "--config=playwright.config.ts",
        "--project=tanstack-start-integration-webkit-representative",
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

if (import.meta.main) {
  process.exitCode = await runWebKitWithFreshProcesses({
    maxAttempts: webkitMaxAttempts(process.env.CI),
    runPlaywright,
  })
}
