import type { EmailProvider, EmailRuntime, SendEmail } from "../contracts/email"

export type RuntimeEmailSenderOptions = {
  provider: EmailProvider
  runtime: EmailRuntime
  from: string
  fromName?: string
  mailpitUrl?: string
}

export declare const createRuntimeEmailSender: (
  options: RuntimeEmailSenderOptions
) => SendEmail

export declare const backgroundTaskHandler:
  | ((promise: Promise<unknown>) => void)
  | undefined
