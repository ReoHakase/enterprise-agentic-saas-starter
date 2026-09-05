import { createContext } from "react"

export type InvitationMutationState = {
  busyInvitationId?: string
  pending: boolean
}

export const InvitationMutationContext = createContext<InvitationMutationState>(
  {
    pending: false,
  }
)
