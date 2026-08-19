import { queryOptions } from "@tanstack/react-query"

import { consoleKeys } from "@/features/console"
import { getBrowserConsoleApi } from "@/lib/browser/console-api"

export const mcpOAuthSessionsQueryOptions = () =>
  queryOptions({
    queryKey: consoleKeys.mcpOAuthSessions(),
    queryFn: ({ signal }) =>
      getBrowserConsoleApi().listMcpOAuthSessions(signal),
  })
