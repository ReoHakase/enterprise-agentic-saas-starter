import type {
  EmailTemplate,
  SendEmail,
  SendEmailInput,
} from "../contracts/email"

type CloudflareEmailMessage = {
  to: string
  from: string | { email: string; name?: string }
  subject: string
  html?: string
  text: string
}

export type CloudflareEmailBinding = {
  send(message: CloudflareEmailMessage): Promise<{ messageId: string }>
}

export type CloudflareEmailEvent =
  | {
      status: "accepted"
      template: EmailTemplate
      recipientDomain: string | null
      messageId: string
    }
  | {
      status: "failed"
      template: EmailTemplate
      recipientDomain: string | null
      code: CloudflareEmailErrorCode
      retryable: boolean
    }

export type CloudflareEmailObserver = (event: CloudflareEmailEvent) => void

const knownErrorCodes = [
  "E_VALIDATION_ERROR",
  "E_FIELD_MISSING",
  "E_TOO_MANY_RECIPIENTS",
  "E_TOO_MANY_ATTACHMENTS",
  "E_SENDER_NOT_VERIFIED",
  "E_RECIPIENT_NOT_ALLOWED",
  "E_RECIPIENT_SUPPRESSED",
  "E_SENDER_DOMAIN_NOT_AVAILABLE",
  "E_CONTENT_TOO_LARGE",
  "E_DELIVERY_FAILED",
  "E_RATE_LIMIT_EXCEEDED",
  "E_DAILY_LIMIT_EXCEEDED",
  "E_INTERNAL_SERVER_ERROR",
  "E_HEADER_NOT_ALLOWED",
  "E_HEADER_USE_API_FIELD",
  "E_HEADER_VALUE_INVALID",
  "E_HEADER_VALUE_TOO_LONG",
  "E_HEADER_NAME_INVALID",
  "E_HEADERS_TOO_LARGE",
  "E_HEADERS_TOO_MANY",
] as const

const knownErrorCodeSet: ReadonlySet<string> = new Set(knownErrorCodes)

type CloudflareEmailErrorCode = (typeof knownErrorCodes)[number] | "E_UNKNOWN"

const retryableCodes = new Set<CloudflareEmailErrorCode>([
  "E_RATE_LIMIT_EXCEEDED",
  "E_INTERNAL_SERVER_ERROR",
])

const isKnownErrorCode = (
  value: unknown
): value is (typeof knownErrorCodes)[number] =>
  typeof value === "string" && knownErrorCodeSet.has(value)

const errorCode = (error: unknown): CloudflareEmailErrorCode => {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return "E_UNKNOWN"
  }
  return isKnownErrorCode(error.code) ? error.code : "E_UNKNOWN"
}

const recipientDomain = (address: string) => {
  const separator = address.lastIndexOf("@")
  return separator < 0 ? null : address.slice(separator + 1).toLowerCase()
}

const assertEmailAddress = (address: string, field: "from" | "to") => {
  const normalized = address.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new EmailDeliveryError("E_VALIDATION_ERROR", false, field)
  }
  return normalized
}

export class EmailDeliveryError extends Error {
  readonly code: CloudflareEmailErrorCode
  readonly retryable: boolean
  readonly field?: "from" | "to"

  constructor(
    code: CloudflareEmailErrorCode,
    retryable: boolean,
    field?: "from" | "to"
  ) {
    super("Email delivery failed")
    this.name = "EmailDeliveryError"
    this.code = code
    this.retryable = retryable
    this.field = field
  }
}

export const createCloudflareEmailSender = ({
  binding,
  from,
  fromName,
  observe,
}: {
  binding: CloudflareEmailBinding
  from: string
  fromName?: string
  observe?: CloudflareEmailObserver
}): SendEmail => {
  const senderAddress = assertEmailAddress(from, "from")
  const notify = (event: CloudflareEmailEvent) => {
    try {
      observe?.(event)
    } catch {
      // Delivery outcome must not be changed by an observability callback.
    }
  }

  return async (input: SendEmailInput) => {
    const to = assertEmailAddress(input.to, "to")
    const domain = recipientDomain(to)

    try {
      const result = await binding.send({
        to,
        from: fromName
          ? { email: senderAddress, name: fromName }
          : senderAddress,
        subject: input.subject,
        text: input.text,
        ...(input.html === undefined ? {} : { html: input.html }),
      })

      notify({
        status: "accepted",
        template: input.template,
        recipientDomain: domain,
        messageId: result.messageId,
      })
    } catch (error) {
      if (error instanceof EmailDeliveryError) {
        throw error
      }

      const code = errorCode(error)
      const retryable = retryableCodes.has(code)
      notify({
        status: "failed",
        template: input.template,
        recipientDomain: domain,
        code,
        retryable,
      })
      throw new EmailDeliveryError(code, retryable)
    }
  }
}
