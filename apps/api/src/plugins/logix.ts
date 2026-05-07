import { Elysia } from "elysia"
import { logixlysia } from "logixlysia"

import { env } from "../env"

const production = env.NODE_ENV === "production"

export const logixPlugin = new Elysia({ name: "logix" }).use(
  logixlysia({
    config: {
      autoRedact: true,
      ip: true,
      service: env.APP_NAME,
      timestamp: { translateTime: "yyyy-mm-dd HH:MM:ss.SSS" },
      pino: {
        level: production ? "info" : "debug",
        prettyPrint: !production,
      },
    },
  })
)
