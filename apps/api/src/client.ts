import { treaty, type Treaty } from "@elysia/eden"

import type { App } from "./app"

type TreatyOptions = NonNullable<Parameters<typeof treaty<App>>[1]>

export type CreateApiClientOptions = Omit<TreatyOptions, "parseDate">

export const createApiClient = (
  baseUrl: string,
  options?: CreateApiClientOptions
): Treaty.Create<App> =>
  treaty<App>(baseUrl, {
    ...options,
    parseDate: false,
  })

export type ApiClient = ReturnType<typeof createApiClient>
