import type {
  EmailRuntime,
  EmailTemplate,
  SendEmail,
  SendEmailInput,
} from "../contracts/email"

type MailpitEmailAddress = {
  Email: string
  Name?: string
}

type MailpitSendMessage = {
  From: MailpitEmailAddress
  To: [MailpitEmailAddress]
  Subject: string
  Text: string
  HTML?: string
  Tags: [EmailTemplate]
}

type MailpitDeliveryErrorCode = "E_HTTP" | "E_NETWORK" | "E_VALIDATION_ERROR"

const assertEmailAddress = (address: string, field: "from" | "to") => {
  const normalized = address.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new MailpitDeliveryError("E_VALIDATION_ERROR", false, field)
  }
  return normalized
}

const isLoopbackHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase()
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "[::1]"
  ) {
    return true
  }

  const segments = normalized.split(".")
  return (
    segments.length === 4 &&
    segments[0] === "127" &&
    segments.every(
      (segment) =>
        /^\d{1,3}$/.test(segment) && Number.parseInt(segment, 10) <= 255
    )
  )
}

const resolveSendUrl = (baseUrl: string) => {
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    throw new MailpitConfigurationError("MAILPIT_URL must be a valid URL")
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    !isLoopbackHostname(parsed.hostname)
  ) {
    throw new MailpitConfigurationError(
      "MAILPIT_URL must use HTTP(S) on a loopback or .localhost host without credentials"
    )
  }

  return new URL("/api/v1/send", parsed.origin).toString()
}

const toMailpitMessage = (
  input: SendEmailInput,
  from: MailpitEmailAddress
): MailpitSendMessage => ({
  From: from,
  To: [{ Email: assertEmailAddress(input.to, "to") }],
  Subject: input.subject,
  Text: input.text,
  ...(input.html === undefined ? {} : { HTML: input.html }),
  Tags: [input.template],
})

class MailpitConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MailpitConfigurationError"
  }
}

export class MailpitDeliveryError extends Error {
  readonly code: MailpitDeliveryErrorCode
  readonly retryable: boolean
  readonly field?: "from" | "to"
  readonly status?: number

  constructor(
    code: MailpitDeliveryErrorCode,
    retryable: boolean,
    field?: "from" | "to",
    status?: number,
    cause?: unknown
  ) {
    super("Local email delivery failed", { cause })
    this.name = "MailpitDeliveryError"
    this.code = code
    this.retryable = retryable
    this.field = field
    this.status = status
  }
}

export const createMailpitEmailSender = ({
  baseUrl,
  from,
  fromName,
  runtime,
  fetch: request = globalThis.fetch,
  timeoutMs = 5_000,
}: {
  baseUrl: string
  from: string
  fromName?: string
  runtime: EmailRuntime
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
}): SendEmail => {
  if (runtime !== "development") {
    throw new MailpitConfigurationError(
      "Mailpit email delivery is available only in development"
    )
  }

  const sendUrl = resolveSendUrl(baseUrl)
  const fromAddress: MailpitEmailAddress = {
    Email: assertEmailAddress(from, "from"),
    ...(fromName ? { Name: fromName } : {}),
  }

  return async (input) => {
    const message = toMailpitMessage(input, fromAddress)
    let response: Response

    try {
      response = await request(sendUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(message),
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      throw new MailpitDeliveryError(
        "E_NETWORK",
        true,
        undefined,
        undefined,
        error
      )
    }

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500
      throw new MailpitDeliveryError(
        "E_HTTP",
        retryable,
        undefined,
        response.status
      )
    }
  }
}
