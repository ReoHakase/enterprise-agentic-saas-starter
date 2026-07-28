import { treaty, type Treaty } from "@elysia/eden"
import type { AgentInternalFetchBinding } from "@enterprise-agentic-saas/agent-contracts"

import type { AgentInternalApp } from "./modules/agent/internal-api"

export * from "@enterprise-agentic-saas/agent-contracts"

/**
 * server-only private Service Binding client. Browserへ公開するpublic API clientと
 * 同じentry pointへ再exportせず、API内部の契約検査だけがこのfactoryを利用する。
 */
export const createAgentInternalClient = (
  binding: AgentInternalFetchBinding
): Treaty.Create<AgentInternalApp> => {
  const serviceBindingFetch: typeof fetch = Object.assign(
    (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ) => {
      const request =
        input instanceof Request
          ? init === undefined
            ? input
            : new Request(input, init)
          : new Request(input, init)
      return binding.fetch(request)
    },
    {
      preconnect: () => undefined,
    }
  )
  return treaty<AgentInternalApp>("https://agent-internal.invalid", {
    fetcher: serviceBindingFetch,
    parseDate: false,
  })
}

export type AgentInternalClient = ReturnType<typeof createAgentInternalClient>
