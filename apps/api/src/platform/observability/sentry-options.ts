import { scrubSentryEvent, scrubSentryLog, scrubSentrySpan } from "./sanitize"

export const SPOTLIGHT_DSN = "https://spotlight@local/0"

const disabledSentryIntegrations = new Set([
  "Console",
  "LinkedErrors",
  "RequestData",
])

export const filterSentryIntegrations = <T extends { name: string }>(
  integrations: T[]
): T[] =>
  integrations.filter(
    (integration) => !disabledSentryIntegrations.has(integration.name)
  )

const noTracePropagationTargets: string[] = []

export const sentryPrivacyOptions = {
  beforeBreadcrumb: () => null,
  beforeSend: scrubSentryEvent,
  beforeSendLog: scrubSentryLog,
  beforeSendSpan: scrubSentrySpan,
  beforeSendTransaction: scrubSentryEvent,
  includeServerName: false,
  maxBreadcrumbs: 0,
  sendDefaultPii: false,
  tracePropagationTargets: noTracePropagationTargets,
}
