import { initializeBunObservability } from "./observability/sentry-bun"

initializeBunObservability()

const [
  { db },
  { createApp },
  { env },
  { authPlugin },
  { corsPlugin },
  { serverTimingPlugin },
] = await Promise.all([
  import("@enterprise-agentic-saas/db"),
  import("./app"),
  import("./env"),
  import("./plugins/auth"),
  import("./plugins/cors"),
  import("./plugins/server-timing"),
])

const app = createApp(db)
  .use(authPlugin)
  .use(corsPlugin)
  .use(serverTimingPlugin)

app.listen(env.PORT)
