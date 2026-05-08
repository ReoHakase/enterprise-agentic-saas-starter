import type { SendEmail, SendEmailInput } from "../types"

export type ConsoleEmailLogger = (input: SendEmailInput) => void

const defaultConsoleLogger: ConsoleEmailLogger = (input: SendEmailInput) => {
  const payload: Record<string, unknown> = {
    to: input.to,
    subject: input.subject,
    textLength: input.text.length,
  }
  if (input.html !== undefined) {
    payload.htmlLength = input.html.length
  }
  if (input.renderProps !== undefined) {
    payload.renderProps = input.renderProps
  }
  console.info("email:send", payload)
}

export const createConsoleSender =
  (logger: ConsoleEmailLogger = defaultConsoleLogger): SendEmail =>
  async (input) =>
    logger(input)
