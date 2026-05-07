import { treaty, type Treaty } from "@elysia/eden"

import type { App } from "./app"

export type CreateApiClientOptions = Parameters<typeof treaty<App>>[1]

export const createApiClient = (
  baseUrl: string,
  options?: CreateApiClientOptions
): Treaty.Create<App> => treaty<App>(baseUrl, options)

export type ApiClient = ReturnType<typeof createApiClient>
