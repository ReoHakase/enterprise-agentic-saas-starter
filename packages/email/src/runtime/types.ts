import type { EmailProvider, EmailRuntime } from "../senders/configured"
import type { SendEmail } from "../types"

export type RuntimeEmailSenderOptions = {
  provider: EmailProvider
  runtime: EmailRuntime
  from: string
  fromName?: string
}

export declare const createRuntimeEmailSender: (
  options: RuntimeEmailSenderOptions
) => SendEmail

export declare const backgroundTaskHandler:
  | ((promise: Promise<unknown>) => void)
  | undefined
