import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { toast } from "sonner"

import { authErrorMessage } from "./runtime-guards"

export function ErrorToaster() {
  const queryClient = useQueryClient()

  useEffect(() => {
    queryClient.getQueryCache().config.onError = (error) => {
      toast.error(authErrorMessage(error))
    }

    queryClient.setMutationDefaults([], {
      onError: (error) => {
        toast.error(authErrorMessage(error))
      },
    })
  }, [queryClient])

  return null
}
