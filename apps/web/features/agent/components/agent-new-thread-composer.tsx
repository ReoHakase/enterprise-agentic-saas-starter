"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { HandIcon, ImagePlusIcon, SendIcon } from "lucide-react"
import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react"

import {
  AgentComposer,
  type AgentComposerHandle,
  type AgentMentionValue,
} from "@/features/agent/components/agent-composer"
import { AgentSamplePrompts } from "@/features/agent/components/agent-sample-prompts"
import { isAgentHotkeyAllowed } from "@/features/agent/hotkey-scope"

const attachmentButtonRender = <span />
const emptyMentionCandidates: AgentMentionValue[] = []

export const AgentNewThreadComposer = ({
  disabled,
  creating,
  onCreate,
}: {
  disabled: boolean
  creating: boolean
  onCreate: (composer: string, files: File[], autoSubmit: boolean) => void
}) => {
  const [composer, setComposer] = useState("")
  const formRef = useRef<HTMLFormElement>(null)
  const composerRef = useRef<AgentComposerHandle>(null)
  const choosePrompt = useCallback((prompt: string) => setComposer(prompt), [])
  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const message = composer.trim()
      if (!message || disabled || creating) return
      onCreate(message, [], true)
    },
    [composer, creating, disabled, onCreate]
  )
  const attach = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = [...(event.target.files ?? [])]
      event.target.value = ""
      if (files.length === 0 || disabled || creating) return
      onCreate(composer, files, false)
    },
    [composer, creating, disabled, onCreate]
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
          candidates={emptyMentionCandidates}
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
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <HandIcon className="size-3.5" /> Ask always
          </span>
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
