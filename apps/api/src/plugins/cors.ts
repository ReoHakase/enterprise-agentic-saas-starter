import { cors } from "@elysia/cors"
import { Elysia } from "elysia"

import { env } from "../env"

export const corsPlugin = new Elysia({ name: "cors" }).use(
  cors({
    credentials: true,
    exposeHeaders: ["Server-Timing"],
    origin: env.CORS_ORIGIN,
  })
)
