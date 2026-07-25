"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { ImagePlusIcon, SendIcon } from "lucide-react"
import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react"

import { isAgentHotkeyAllowed } from "../hotkey-scope"
import { useAgentMentionCandidates } from "../use-agent-mention-candidates"
import {
  AgentComposer,
  type AgentComposerHandle,
  type AgentComposerSnapshot,
} from "./agent-composer"
import {
  AgentPermissionSelect,
  type AgentPermissionMode,
} from "./agent-policy-control"
import { AgentSamplePrompts } from "./agent-sample-prompts"

const attachmentButtonRender = <span />

export type AgentNewThreadInput = {
  composer: string
  snapshot: AgentComposerSnapshot
  files: File[]
  autoSubmit: boolean
  permissionMode: AgentPermissionMode
}

const hasComposerContent = (snapshot: AgentComposerSnapshot) =>
  snapshot.parts.some(
    (part) =>
      part.type === "data-context-reference" ||
      (part.type === "text" && part.text.trim().length > 0)
  )

export const AgentNewThreadComposer = ({
  organizationId,
  disabled,
  creating,
  onCreate,
}: {
  organizationId: string
  disabled: boolean
  creating: boolean
  onCreate: (input: AgentNewThreadInput) => void
}) => {
  const [composer, setComposer] = useState("")
  const [permissionMode, setPermissionMode] =
    useState<AgentPermissionMode>("ask_always")
  const formRef = useRef<HTMLFormElement>(null)
  const composerRef = useRef<AgentComposerHandle>(null)
  const mentionCandidates = useAgentMentionCandidates(organizationId)
  const choosePrompt = useCallback((prompt: string) => setComposer(prompt), [])
  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const snapshot = composerRef.current?.snapshot()
      if (!snapshot || !hasComposerContent(snapshot) || disabled || creating)
        return
      onCreate({
        composer,
        snapshot,
        files: [],
        autoSubmit: true,
        permissionMode,
      })
    },
    [composer, creating, disabled, onCreate, permissionMode]
  )
  const attach = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = [...(event.target.files ?? [])]
      event.target.value = ""
      if (files.length === 0 || disabled || creating) return
      const snapshot = composerRef.current?.snapshot()
      if (!snapshot) return
      onCreate({
        composer,
        snapshot,
        files,
        autoSubmit: false,
        permissionMode,
      })
    },
    [composer, creating, disabled, onCreate, permissionMode]
  )
  useHotkeys(
    [
      {
        hotkey: "Mod+Enter",
        callback: (event) => {
          if (isAgentHotkeyAllowed(event)) formRef.current?.requestSubmit()
        },
        options: { enabled: !disabled && !creating, ignoreInputs: false },
      },
    ],
    {
      conflictBehavior: "allow",
      meta: { name: "New Agent thread", description: "Send first message" },
    }
  )

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <div className="min-h-72 flex-1 overflow-y-auto">
        <AgentSamplePrompts onSelect={choosePrompt} />
      </div>
      <form
        ref={formRef}
        className="flex min-w-0 shrink-0 flex-col gap-2 rounded-2xl border bg-card p-3 shadow-sm"
        onSubmit={submit}
      >
        <AgentComposer
          ref={composerRef}
          candidates={mentionCandidates}
          disabled={disabled || creating}
          draftText={composer}
          onDraftTextChange={setComposer}
        />
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <label className="inline-flex" htmlFor="agent-new-thread-images">
            <Input
              id="agent-new-thread-images"
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              disabled={disabled || creating}
              onChange={attach}
            />
            <Button
              render={attachmentButtonRender}
              nativeButton={false}
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled || creating}
            >
              <ImagePlusIcon data-icon="inline-start" /> Attach
            </Button>
          </label>
          <AgentPermissionSelect
            mode={permissionMode}
            disabled={disabled || creating}
            onModeChange={setPermissionMode}
          />
          <Button
            className="ml-auto"
            type="submit"
            disabled={disabled || creating}
          >
            {creating ? <Spinner /> : <SendIcon data-icon="inline-start" />}
            {creating ? "Starting…" : "Send"}
          </Button>
        </div>
      </form>
    </div>
  )
}
