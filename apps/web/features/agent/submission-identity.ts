export type PendingChatSubmission = {
  id: string
  fingerprint: string
}

export const resolveAgentSubmissionIdentity = (
  previous: PendingChatSubmission | undefined,
  fingerprint: string,
  createId: () => string
) => {
  const retrying = previous?.fingerprint === fingerprint
  const id = retrying ? previous.id : createId()
  return {
    id,
    retrying,
    pending: { id, fingerprint } satisfies PendingChatSubmission,
  }
}

export const shouldRetainAgentSubmission = (input: {
  isAbort: boolean
  isDisconnect: boolean
  isError: boolean
}) => input.isAbort || input.isDisconnect || input.isError
