import { db } from "@enterprise-agentic-saas/db"
import * as Sentry from "@sentry/cloudflare"
import { Elysia } from "elysia"
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker"

import { createApp } from "./app"
import { handleDevelopmentFileSeedRequest } from "./development/file-seed-handler"
import { processFileCleanupJobs } from "./modules/files/cleanup-jobs"
import {
  configureFileStorageRuntime,
  type FileCache,
  type FileImagesBinding,
  type FileR2Bucket,
} from "./modules/files/runtime"
import {
  processOrganizationDeletionJobs,
  type OrganizationFilesBucket,
} from "./modules/organizations/deletion-jobs"
import { processInvitationEmailJobs } from "./modules/organizations/invitation-email-jobs"
import { processProfileImageCleanupJobs } from "./modules/profile-images/cleanup-jobs"
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
  DEV_FILE_SEED_TOKEN?: string
  FILES: FileR2Bucket & OrganizationFilesBucket
  IMAGES: FileImagesBinding
  NODE_ENV?: string
  SENTRY_DSN?: string
  SENTRY_ENVIRONMENT?: string
  SENTRY_RELEASE?: string
  SENTRY_SPOTLIGHT?: string
  SENTRY_TRACES_SAMPLE_RATE?: string
  TURSO_DATABASE_URL?: string
}

type WorkerExecutionContext = {
  waitUntil: (promise: Promise<unknown>) => void
}

type WorkerScheduledController = {
  cron: string
  scheduledTime: number
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

const appFetch = worker.fetch.bind(worker)

const isFileCache = (value: unknown): value is FileCache =>
  value !== null &&
  typeof value === "object" &&
  typeof Reflect.get(value, "match") === "function" &&
  typeof Reflect.get(value, "put") === "function"

const cloudflareDefaultCache = (): FileCache | undefined => {
  const cacheStorage = Reflect.get(globalThis, "caches")
  if (!cacheStorage || typeof cacheStorage !== "object") return undefined
  const defaultCache: unknown = Reflect.get(cacheStorage, "default")
  return isFileCache(defaultCache) ? defaultCache : undefined
}

const workerWithScheduled = {
  async fetch(
    request: Request,
    workerEnv: WorkerSentryEnv,
    _context: WorkerExecutionContext
  ) {
    configureFileStorageRuntime({
      bucket: workerEnv.FILES,
      cache: cloudflareDefaultCache(),
      images: workerEnv.IMAGES,
    })
    const seedResponse = await handleDevelopmentFileSeedRequest(
      db,
      request,
      workerEnv
    )
    return seedResponse ?? appFetch(request)
  },
  scheduled(
    _controller: WorkerScheduledController,
    workerEnv: WorkerSentryEnv,
    context: WorkerExecutionContext
  ) {
    const deletionJobs = processOrganizationDeletionJobs({
      bucket: workerEnv.FILES,
      database: db,
      onFailure: ({ attempts }) => {
        const error = new Error("Organization file cleanup failed")
        Sentry.captureException(error, {
          tags: {
            component: "organization-deletion",
            errorCode: "r2_cleanup_failed",
          },
          extra: { attempts },
        })
        console.error({
          attempts,
          component: "organization-deletion",
          errorCode: "r2_cleanup_failed",
          event: "cleanup_job_failed",
          level: "error",
        })
      },
    }).then((result) => {
      console.info({
        component: "organization-deletion",
        event: "cleanup_batch_completed",
        level: "info",
        ...result,
      })
      return result
    })
    const fileCleanupJobs = processFileCleanupJobs({
      bucket: workerEnv.FILES,
      database: db,
      onFailure: ({ attempts }) => {
        const error = new Error("File cleanup failed")
        Sentry.captureException(error, {
          tags: {
            component: "file-cleanup",
            errorCode: "r2_cleanup_failed",
          },
          extra: { attempts },
        })
        console.error({
          attempts,
          component: "file-cleanup",
          errorCode: "r2_cleanup_failed",
          event: "cleanup_job_failed",
          level: "error",
        })
      },
    }).then((result) => {
      console.info({
        component: "file-cleanup",
        event: "cleanup_batch_completed",
        level: "info",
        ...result,
      })
      return result
    })
    const profileImageCleanupJobs = processProfileImageCleanupJobs({
      bucket: workerEnv.FILES,
      database: db,
      onFailure: ({ attempts }) => {
        const error = new Error("Profile image cleanup failed")
        Sentry.captureException(error, {
          tags: {
            component: "profile-image-cleanup",
            errorCode: "r2_cleanup_failed",
          },
          extra: { attempts },
        })
        console.error({
          attempts,
          component: "profile-image-cleanup",
          errorCode: "r2_cleanup_failed",
          event: "cleanup_job_failed",
          level: "error",
        })
      },
    }).then((result) => {
      console.info({
        component: "profile-image-cleanup",
        event: "cleanup_batch_completed",
        level: "info",
        ...result,
      })
      return result
    })
    const invitationJobs = processInvitationEmailJobs({
      database: db,
      onFailure: ({ attempts, errorCode, retryable }) => {
        const error = new Error("Organization invitation delivery failed")
        Sentry.captureException(error, {
          tags: {
            component: "invitation-email",
            errorCode,
            retryable,
          },
          extra: { attempts },
        })
        console.error({
          attempts,
          component: "invitation-email",
          errorCode,
          event: "delivery_job_failed",
          level: "error",
          retryable,
        })
      },
    }).then((result) => {
      console.info({
        component: "invitation-email",
        event: "delivery_batch_completed",
        level: "info",
        ...result,
      })
      return result
    })

    context.waitUntil(
      Promise.all([
        deletionJobs,
        fileCleanupJobs,
        profileImageCleanupJobs,
        invitationJobs,
      ]).then(() => undefined)
    )
  },
}

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
}, workerWithScheduled)
