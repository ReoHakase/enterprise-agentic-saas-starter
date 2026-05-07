import type { SendEmail, SendEmailInput } from "../types"

export type ConsoleEmailLogger = (input: SendEmailInput) => void

export const createConsoleSender =
  (
    logger: ConsoleEmailLogger = (input: SendEmailInput) => {
      console.info("email:send", input)
    }
  ): SendEmail =>
  async (input) =>
    logger(input)
