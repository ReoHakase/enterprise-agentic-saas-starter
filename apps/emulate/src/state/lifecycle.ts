import type { Emulator } from "emulate"

export type ExitProcess = (code: number) => void

export const createGracefulShutdown = (
  emulator: Pick<Emulator, "close">,
  exitProcess: ExitProcess
) => {
  let closing: Promise<void> | undefined

  return () => {
    closing ??= emulator.close().then(
      () => exitProcess(0),
      () => exitProcess(1)
    )

    return closing
  }
}
