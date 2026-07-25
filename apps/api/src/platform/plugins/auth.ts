import { auth } from "@enterprise-agentic-saas/auth"
import { Elysia } from "elysia"

export const authPlugin = new Elysia({ name: "auth" }).mount(auth.handler)
