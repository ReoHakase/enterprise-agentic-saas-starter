import type { SendEmail, SendEmailInput } from "../types"

export type ConsoleEmailEvent = {
  template: SendEmailInput["template"]
  recipientDomain: string | null
  subject: string
  textLength: number
  htmlLength?: number
  renderPropKeys: string[]
}

export type ConsoleEmailLogger = (event: ConsoleEmailEvent) => void

const recipientDomain = (address: string) => {
  const separator = address.lastIndexOf("@")
  return separator < 0 ? null : address.slice(separator + 1).toLowerCase()
}

const renderPropKeys = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value)
    : []

export const toConsoleEmailEvent = (
  input: SendEmailInput
): ConsoleEmailEvent => ({
  template: input.template,
  recipientDomain: recipientDomain(input.to),
  subject: input.subject,
  textLength: input.text.length,
  ...(input.html === undefined ? {} : { htmlLength: input.html.length }),
  renderPropKeys: renderPropKeys(input.renderProps),
})

const defaultConsoleLogger: ConsoleEmailLogger = (event) =>
  console.info("email:send", event)

export const createConsoleSender =
  (logger: ConsoleEmailLogger = defaultConsoleLogger): SendEmail =>
  async (input) =>
    logger(toConsoleEmailEvent(input))
