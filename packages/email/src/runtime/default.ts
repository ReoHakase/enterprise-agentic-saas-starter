import { createConfiguredEmailSender } from "../senders/configured"
import type { RuntimeEmailSenderOptions } from "./types"

export const createRuntimeEmailSender = ({
  provider,
  runtime,
}: RuntimeEmailSenderOptions) =>
  createConfiguredEmailSender({ provider, runtime })

export const backgroundTaskHandler = undefined
