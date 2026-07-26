import { env, waitUntil } from "cloudflare:workers"

import {
  createCloudflareEmailSender,
  type CloudflareEmailBinding,
  type CloudflareEmailEvent,
} from "../providers/cloudflare"
import { createConfiguredEmailSender } from "../providers/configured"
import type { RuntimeEmailSenderOptions } from "./types"

const isEmailBinding = (value: unknown): value is CloudflareEmailBinding =>
  typeof value === "object" &&
  value !== null &&
  "send" in value &&
  typeof value.send === "function"

const observe = (event: CloudflareEmailEvent) => {
  const metadata = {
    component: "cloudflare-email",
    event: event.status === "accepted" ? "email_accepted" : "email_failed",
    template: event.template,
    recipient_domain: event.recipientDomain,
    ...(event.status === "accepted"
      ? { message_id: event.messageId }
      : { error_code: event.code, retryable: event.retryable }),
  }

  if (event.status === "accepted") {
    console.info(metadata)
    return
  }
  console.error(metadata)
}

export const createRuntimeEmailSender = (
  options: RuntimeEmailSenderOptions
) => {
  if (options.provider !== "cloudflare") {
    if (options.runtime === "production") {
      throw new Error(
        "Cloudflare Workers production requires EMAIL_PROVIDER=cloudflare"
      )
    }
    return createConfiguredEmailSender(options)
  }

  const binding = env.EMAIL
  if (!isEmailBinding(binding)) {
    throw new Error("Cloudflare EMAIL binding is required")
  }

  return createCloudflareEmailSender({
    binding,
    from: options.from,
    fromName: options.fromName,
    observe,
  })
}

export const backgroundTaskHandler = waitUntil
