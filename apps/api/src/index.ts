import { db } from "@enterprise-agentic-saas/db"

import { createApp } from "./app"
import { env } from "./env"
import { authPlugin } from "./plugins/auth"
import { corsPlugin } from "./plugins/cors"
import { logixPlugin } from "./plugins/logix"
import { serverTimingPlugin } from "./plugins/server-timing"
import { telemetryPlugin } from "./plugins/telemetry"

const app = createApp(db)
  .use(authPlugin)
  .use(corsPlugin)
  .use(telemetryPlugin)
  .use(logixPlugin)
  .use(serverTimingPlugin)

app.listen(env.PORT)
