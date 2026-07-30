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
  import("./platform/env"),
  import("./platform/plugins/auth"),
  import("./platform/plugins/cors"),
  import("./platform/plugins/server-timing"),
])

const app = createApp(db)
  .use(authPlugin)
  .use(corsPlugin)
  .use(serverTimingPlugin)

app.listen(env.PORT)
