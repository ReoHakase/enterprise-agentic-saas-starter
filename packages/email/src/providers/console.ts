import type { SendEmail, SendEmailInput } from "../contracts/email"

export type ConsoleEmailEvent = {
  template: SendEmailInput["template"]
  recipientDomain: string | null
}

export type ConsoleEmailLogger = (event: ConsoleEmailEvent) => void

const recipientDomain = (address: string) => {
  const separator = address.lastIndexOf("@")
  return separator < 0 ? null : address.slice(separator + 1).toLowerCase()
}

const toConsoleEmailEvent = (input: SendEmailInput): ConsoleEmailEvent => ({
  template: input.template,
  recipientDomain: recipientDomain(input.to),
})

const defaultConsoleLogger: ConsoleEmailLogger = (event) =>
  console.info("email:send", event)

export const createConsoleSender =
  (logger: ConsoleEmailLogger = defaultConsoleLogger): SendEmail =>
  async (input) =>
    logger(toConsoleEmailEvent(input))
