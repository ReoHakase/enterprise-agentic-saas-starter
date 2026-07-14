import { createConsoleSender } from "./console"
import { createMailpitEmailSender } from "./mailpit"
import { createNoopSender } from "./noop"

export type EmailProvider = "cloudflare" | "console" | "mailpit" | "noop"
export type EmailRuntime = "development" | "production" | "test"

export const createConfiguredEmailSender = ({
  provider,
  runtime,
  from,
  fromName,
  mailpitUrl,
}: {
  provider: EmailProvider
  runtime: EmailRuntime
  from?: string
  fromName?: string
  mailpitUrl?: string
}) => {
  if (provider === "noop") {
    return createNoopSender()
  }

  if (provider === "cloudflare") {
    throw new Error(
      "EMAIL_PROVIDER=cloudflare requires the Cloudflare Worker runtime email binding"
    )
  }

  if (provider === "mailpit") {
    if (!from || !mailpitUrl) {
      throw new Error(
        "EMAIL_FROM and MAILPIT_URL are required when EMAIL_PROVIDER=mailpit"
      )
    }

    return createMailpitEmailSender({
      baseUrl: mailpitUrl,
      from,
      fromName,
      runtime,
    })
  }

  if (runtime === "production") {
    throw new Error(
      "EMAIL_PROVIDER=console is disabled in production because authentication links must not be written to logs. Configure a production email adapter before deployment."
    )
  }

  return createConsoleSender()
}
