import { openapi } from "@elysia/openapi"
import { Elysia } from "elysia"

export const openApiPlugin = new Elysia({ name: "openapi" }).use(
  openapi({
    path: "/openapi",
  })
)
