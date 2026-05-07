import { opentelemetry } from "@elysiajs/opentelemetry"
import { Elysia } from "elysia"

import { env } from "../env"

export const telemetryPlugin = new Elysia({ name: "telemetry" }).use(
  opentelemetry({
    serviceName: env.APP_NAME,
  })
)
