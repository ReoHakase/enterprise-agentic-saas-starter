import { createConsoleSender } from "./console"
import { createNoopSender } from "./noop"

export type EmailProvider = "cloudflare" | "console" | "noop"
export type EmailRuntime = "development" | "production" | "test"

export const createConfiguredEmailSender = ({
  provider,
  runtime,
}: {
  provider: EmailProvider
  runtime: EmailRuntime
}) => {
  if (provider === "noop") {
    return createNoopSender()
  }

  if (provider === "cloudflare") {
    throw new Error(
      "EMAIL_PROVIDER=cloudflare requires the Cloudflare Worker runtime email binding"
    )
  }

  if (runtime === "production") {
    throw new Error(
      "EMAIL_PROVIDER=console is disabled in production because authentication links must not be written to logs. Configure a production email adapter before deployment."
    )
  }

  return createConsoleSender()
}
