import { createConfiguredEmailSender } from "../providers/configured"
import type { RuntimeEmailSenderOptions } from "./types"

export const createRuntimeEmailSender = (options: RuntimeEmailSenderOptions) =>
  createConfiguredEmailSender(options)

export const backgroundTaskHandler = undefined
