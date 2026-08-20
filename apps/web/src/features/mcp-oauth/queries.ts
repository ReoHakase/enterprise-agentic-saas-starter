import { queryOptions } from "@tanstack/react-query"

import { consoleKeys } from "@/features/console"
import { browserConsoleApi } from "@/lib/browser/console-api"

export const mcpOAuthSessionsQueryOptions = () =>
  queryOptions({
    queryKey: consoleKeys.mcpOAuthSessions(),
    queryFn: ({ signal }) => browserConsoleApi.listMcpOAuthSessions(signal),
  })
