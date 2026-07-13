import { db } from "@enterprise-agentic-saas/db"
import * as Sentry from "@sentry/cloudflare"
import { Elysia } from "elysia"
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker"

import { createApp } from "./app"
import { configureObservability } from "./observability/runtime"
import { createSentryObservabilityRuntime } from "./observability/sentry-adapter"
import {
  filterSentryIntegrations,
  sentryPrivacyOptions,
  SPOTLIGHT_DSN,
} from "./observability/sentry-options"
import { resolveSpotlightTarget } from "./observability/spotlight"
import { withStructuredConsole } from "./observability/structured-console"
import { authPlugin } from "./plugins/auth"
import { corsPlugin } from "./plugins/cors"
import { serverTimingPlugin } from "./plugins/server-timing"

type WorkerSentryEnv = {
  NODE_ENV?: string
  SENTRY_DSN?: string
  SENTRY_ENVIRONMENT?: string
  SENTRY_RELEASE?: string
  SENTRY_SPOTLIGHT?: string
  SENTRY_TRACES_SAMPLE_RATE?: string
}

const tracesSampleRate = (value: string | undefined): number => {
  const parsed = Number(value ?? "0.1")
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.1
}

configureObservability(
  withStructuredConsole(
    createSentryObservabilityRuntime(Sentry, "enterprise-agentic-saas-api"),
    "enterprise-agentic-saas-api"
  )
)

// Bun向けSentry SDKをbundleせず、Worker requestごとにCloudflare SDKを初期化する。
const worker = new Elysia({ adapter: CloudflareAdapter })
  .use(createApp(db))
  .use(authPlugin)
  .use(corsPlugin)
  .use(serverTimingPlugin)
  .compile()

export default Sentry.withSentry<WorkerSentryEnv>((workerEnv) => {
  const development = workerEnv.NODE_ENV === "development"
  const spotlight = resolveSpotlightTarget(
    workerEnv.SENTRY_SPOTLIGHT,
    development ? "development" : "production"
  )
  const spotlightEnabled = spotlight !== false

  return {
    ...sentryPrivacyOptions,
    dsn: spotlightEnabled
      ? SPOTLIGHT_DSN
      : development
        ? undefined
        : workerEnv.SENTRY_DSN,
    enableLogs: true,
    environment:
      workerEnv.SENTRY_ENVIRONMENT ??
      (development ? "development" : "production"),
    integrations: filterSentryIntegrations,
    release: workerEnv.SENTRY_RELEASE,
    sampleRate: 1,
    spotlight,
    tracesSampleRate: spotlightEnabled
      ? 1
      : tracesSampleRate(workerEnv.SENTRY_TRACES_SAMPLE_RATE),
  }
}, worker)
