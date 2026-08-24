import { describe, expect, it, vi } from "vitest"

import {
  isWebKitInternalError,
  runWebKitWithFreshProcesses,
  webkitInternalError,
  webkitMaxAttempts,
} from "./run-nextjs-integration-webkit"

describe("Next.js統合WebKitの新規プロセス代替実行", () => {
  it("新しいプロセスで既知の内部エラーを再試行する", async () => {
    const runPlaywright = vi
      .fn<() => Promise<{ exitCode: number; output: string }>>()
      .mockResolvedValueOnce({
        exitCode: 7,
        output: `stderr: ${webkitInternalError}`,
      })
      .mockResolvedValueOnce({ exitCode: 0, output: "passed" })
    const warn = vi.fn<(message: string) => void>()

    const exitCode = await runWebKitWithFreshProcesses({
      maxAttempts: 3,
      runPlaywright,
      warn,
    })

    expect(exitCode).toBe(0)
    expect(runPlaywright).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledOnce()
  })

  it("設定された試行制限で停止する", async () => {
    const runPlaywright = vi.fn<
      () => Promise<{ exitCode: number; output: string }>
    >(async () => ({
      exitCode: 9,
      output: webkitInternalError,
    }))

    const exitCode = await runWebKitWithFreshProcesses({
      maxAttempts: webkitMaxAttempts("true"),
      runPlaywright,
      warn: vi.fn<(message: string) => void>(),
    })

    expect(exitCode).toBe(9)
    expect(runPlaywright).toHaveBeenCalledTimes(3)
    expect(webkitMaxAttempts(undefined)).toBe(1)
  })

  it("再試行せずにターゲット以外の失敗を返す", async () => {
    const runPlaywright = vi.fn<
      () => Promise<{ exitCode: number; output: string }>
    >(async () => ({
      exitCode: 5,
      output: "ordinary assertion failure",
    }))

    const exitCode = await runWebKitWithFreshProcesses({
      maxAttempts: 3,
      runPlaywright,
      warn: vi.fn<(message: string) => void>(),
    })

    expect(exitCode).toBe(5)
    expect(runPlaywright).toHaveBeenCalledOnce()
    expect(
      isWebKitInternalError({ exitCode: 0, output: webkitInternalError })
    ).toBe(false)
  })
})
