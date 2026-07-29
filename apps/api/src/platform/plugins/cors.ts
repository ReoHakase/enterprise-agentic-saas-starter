import { cors } from "@elysia/cors"
import { Elysia } from "elysia"

import { env } from "../env"

export const corsPlugin = new Elysia({ name: "cors" }).use(
  cors({
    allowedHeaders: [
      "authorization",
      "baggage",
      "content-type",
      "traceparent",
      "tracestate",
      "x-request-id",
    ],
    credentials: true,
    exposeHeaders: ["Server-Timing", "x-request-id", "Retry-After"],
    origin: env.CORS_ORIGIN,
  })
)
