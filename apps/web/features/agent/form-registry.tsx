"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@enterprise-agentic-saas/ui/components/alert-dialog"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react"

export type AgentIssueFormValues = {
  title?: string
  description?: string
}

export type AgentFormAdapter = {
  formId: string
  organizationId: string
  resource: "issue"
  resourceId?: string
  revision: number
  epoch: string
  read: () => {
    values: AgentIssueFormValues
    dirtyFields: Array<keyof AgentIssueFormValues>
  }
  validate: (
    patch: AgentIssueFormValues
  ) =>
    | { success: true; patch: AgentIssueFormValues }
    | { success: false; message: string }
  apply: (patch: AgentIssueFormValues) => void
}

type FormTarget = {
  organizationId: string
  formId?: string
  expectedEpoch?: string
  expectedRevision?: number
}

type FormPatchTarget = FormTarget & {
  formId: string
  expectedEpoch: string
  expectedRevision: number
}

export type AgentFormSnapshot = {
  formId: string
  resource: "issue"
  resourceId?: string
  revision: number
  epoch: string
  values: AgentIssueFormValues
  dirtyFields: Array<keyof AgentIssueFormValues>
}

type AgentFormRegistry = {
  register: (adapter: AgentFormAdapter) => () => void
  read: (target: FormTarget) => AgentFormSnapshot
  patch: (
    target: FormPatchTarget,
    patch: AgentIssueFormValues
  ) => Promise<AgentFormSnapshot>
  hasDirtyForms: (organizationId: string) => boolean
  clear: () => void
  setFrozen: (frozen: boolean) => void
}

const AgentFormRegistryContext = createContext<AgentFormRegistry | null>(null)

const selectAdapter = (
  adapters: Map<string, AgentFormAdapter>,
  target: FormTarget,
  requireRevision = false
) => {
  const candidates = [...adapters.values()].filter(
    (candidate) => candidate.organizationId === target.organizationId
  )
  if (!target.formId && candidates.length !== 1) {
    throw new Error(
      candidates.length === 0
        ? "No Issue form is mounted in this organization."
        : "Multiple Issue forms are mounted. Select one by form ID."
    )
  }
  const adapter = target.formId ? adapters.get(target.formId) : candidates[0]

  if (!adapter || adapter.organizationId !== target.organizationId) {
    throw new Error(
      "The requested Issue form is not mounted in this organization."
    )
  }
  if (target.expectedEpoch && target.expectedEpoch !== adapter.epoch) {
    throw new Error(
      "The Issue form changed. Read the draft again before patching it."
    )
  }
  if (requireRevision && target.expectedRevision === undefined) {
    throw new Error(
      "The Issue revision is required. Read the draft again before patching it."
    )
  }
  if (
    target.expectedRevision !== undefined &&
    target.expectedRevision !== adapter.revision
  ) {
    throw new Error(
      "The Issue revision changed. Refresh before patching the form."
    )
  }
  return adapter
}

const snapshot = (adapter: AgentFormAdapter): AgentFormSnapshot => ({
  formId: adapter.formId,
  resource: adapter.resource,
  resourceId: adapter.resourceId,
  revision: adapter.revision,
  epoch: adapter.epoch,
  ...adapter.read(),
})

export const AgentFormRegistryProvider = ({ children }: PropsWithChildren) => {
  const adaptersRef = useRef(new Map<string, AgentFormAdapter>())
  const frozenRef = useRef(false)
  const confirmationRef = useRef<((confirmed: boolean) => void) | null>(null)
  const [confirmationOpen, setConfirmationOpen] = useState(false)

  const register = useCallback((adapter: AgentFormAdapter) => {
    adaptersRef.current.set(adapter.formId, adapter)
    return () => {
      if (adaptersRef.current.get(adapter.formId) === adapter) {
        adaptersRef.current.delete(adapter.formId)
      }
    }
  }, [])
  const read = useCallback((target: FormTarget) => {
    if (frozenRef.current)
      throw new Error("Organization switching is in progress.")
    return snapshot(selectAdapter(adaptersRef.current, target))
  }, [])
  const patch = useCallback(
    async (target: FormPatchTarget, values: AgentIssueFormValues) => {
      if (frozenRef.current)
        throw new Error("Organization switching is in progress.")
      const adapter = selectAdapter(adaptersRef.current, target, true)
      const parsed = adapter.validate(values)
      if (!parsed.success) throw new Error(parsed.message)

      const dirty = new Set(adapter.read().dirtyFields)
      const overlapsDirtyField =
        (parsed.patch.title !== undefined && dirty.has("title")) ||
        (parsed.patch.description !== undefined && dirty.has("description"))
      if (overlapsDirtyField) {
        if (confirmationRef.current) {
          throw new Error("Another Issue draft confirmation is already open.")
        }
        const confirmed = await new Promise<boolean>((resolve) => {
          confirmationRef.current = resolve
          setConfirmationOpen(true)
        })
        if (!confirmed)
          throw new Error("The user kept the existing local draft.")
      }

      if (
        frozenRef.current ||
        adaptersRef.current.get(adapter.formId) !== adapter
      ) {
        throw new Error(
          "The Issue form changed before the patch could be applied."
        )
      }
      adapter.apply(parsed.patch)
      return snapshot(adapter)
    },
    []
  )
  const resolveConfirmation = useCallback((confirmed: boolean) => {
    confirmationRef.current?.(confirmed)
    confirmationRef.current = null
    setConfirmationOpen(false)
  }, [])
  const cancelConfirmation = useCallback(
    () => resolveConfirmation(false),
    [resolveConfirmation]
  )
  const acceptConfirmation = useCallback(
    () => resolveConfirmation(true),
    [resolveConfirmation]
  )
  const handleConfirmationOpenChange = useCallback(
    (open: boolean) => {
      if (!open) cancelConfirmation()
    },
    [cancelConfirmation]
  )
  useEffect(
    () => () => {
      confirmationRef.current?.(false)
      confirmationRef.current = null
    },
    []
  )
  const registry = useMemo<AgentFormRegistry>(
    () => ({
      register,
      read,
      patch,
      hasDirtyForms: (organizationId) =>
        [...adaptersRef.current.values()].some(
          (adapter) =>
            adapter.organizationId === organizationId &&
            adapter.read().dirtyFields.length > 0
        ),
      clear: () => {
        resolveConfirmation(false)
        adaptersRef.current.clear()
      },
      setFrozen: (frozen) => {
        frozenRef.current = frozen
        if (frozen) resolveConfirmation(false)
      },
    }),
    [patch, read, register, resolveConfirmation]
  )

  return (
    <AgentFormRegistryContext.Provider value={registry}>
      {children}
      <AlertDialog
        open={confirmationOpen}
        onOpenChange={handleConfirmationOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace your unsaved field?</AlertDialogTitle>
            <AlertDialogDescription>
              The agent wants to replace a field you already edited. Review the
              proposed value in chat before allowing the patch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelConfirmation}>
              Keep my draft
            </AlertDialogCancel>
            <AlertDialogAction onClick={acceptConfirmation}>
              Apply agent patch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AgentFormRegistryContext.Provider>
  )
}

export const useAgentFormRegistry = () => {
  const registry = useContext(AgentFormRegistryContext)
  if (!registry)
    throw new Error("useAgentFormRegistry requires AgentFormRegistryProvider")
  return registry
}

export const useRegisterAgentForm = (adapter: AgentFormAdapter | null) => {
  const registry = useContext(AgentFormRegistryContext)
  useEffect(
    () => (adapter && registry ? registry.register(adapter) : undefined),
    [adapter, registry]
  )
}
