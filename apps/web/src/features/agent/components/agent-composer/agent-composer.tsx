"use client"

import type { JSONContent } from "@tiptap/core"
import { Mention } from "@tiptap/extension-mention"
import { Placeholder } from "@tiptap/extension-placeholder"
import { splitBlock } from "@tiptap/pm/commands"
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  ReactRenderer,
  useEditor,
  type NodeViewProps,
} from "@tiptap/react"
import { StarterKit } from "@tiptap/starter-kit"
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from "@tiptap/suggestion"
import { XIcon } from "lucide-react"
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react"

import type { AgentChatMessage } from "../../schema"
import { agentComposerDocumentToParts } from "../agent-composer-document/agent-composer-document"

export type AgentMentionValue =
  | {
      kind: "issue" | "file" | "member"
      id: string
      label: string
    }
  | { kind: "current_page"; path: string; label: string }

export type AgentComposerSnapshot = {
  document: JSONContent
  parts: AgentChatMessage["parts"]
}

export type AgentComposerHandle = {
  clear: () => void
  focus: () => void
  restore: (snapshot: AgentComposerSnapshot) => void
  snapshot: () => AgentComposerSnapshot
}

const ContextMentionNode = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      kind: { default: null },
      resourceId: { default: null },
      path: { default: null },
      label: { default: null },
    }
  },
})

const ContextMentionView = ({ deleteNode, node }: NodeViewProps) => {
  const remove = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      deleteNode()
    },
    [deleteNode]
  )
  return (
    <NodeViewWrapper
      as="span"
      className="mx-0.5 inline-flex max-w-full items-center gap-0.5 rounded-md bg-blue-500/10 py-0.5 pr-0.5 pl-1.5 align-baseline text-blue-700 dark:text-blue-300"
    >
      <span className="max-w-56 truncate">@{node.attrs.label}</span>
      <button
        type="button"
        className="grid size-4 shrink-0 place-items-center rounded-sm hover:bg-blue-500/15 focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none"
        aria-label={`Remove ${String(node.attrs.label)}`}
        onMouseDown={remove}
      >
        <XIcon className="size-3" aria-hidden />
      </button>
    </NodeViewWrapper>
  )
}

type MentionListHandle = {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean
}

const MentionList = forwardRef<
  MentionListHandle,
  SuggestionProps<AgentMentionValue>
>(({ command, items }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const choose = useCallback(
    (index: number) => {
      const item = items[index]
      if (!item) return
      command({
        id: item.kind === "current_page" ? item.path : item.id,
        kind: item.kind,
        label: item.label,
        path: item.kind === "current_page" ? item.path : null,
        resourceId: item.kind === "current_page" ? null : item.id,
      })
    },
    [command, items]
  )
  const chooseFromPointer = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      const index = Number(event.currentTarget.dataset.index)
      if (Number.isSafeInteger(index)) choose(index)
    },
    [choose]
  )

  // Reset selection when the filtered candidate list changes.
  // oxlint-disable-next-line react-doctor/no-reset-all-state-on-prop-change, react-doctor/no-adjust-state-on-prop-change
  useEffect(() => setSelectedIndex(0), [items])
  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((current) =>
            items.length === 0 ? 0 : (current + items.length - 1) % items.length
          )
          return true
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((current) =>
            items.length === 0 ? 0 : (current + 1) % items.length
          )
          return true
        }
        if (event.key === "Enter") {
          choose(selectedIndex)
          return true
        }
        return event.key === "Escape"
      },
    }),
    [choose, items.length, selectedIndex]
  )

  return (
    <div className="max-h-64 w-72 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">
      {items.length === 0 ? (
        <p className="p-2 text-xs text-muted-foreground">No context matches.</p>
      ) : (
        items.map((item, index) => (
          <button
            key={
              item.kind === "current_page"
                ? `${item.kind}:${item.path}`
                : `${item.kind}:${item.id}`
            }
            type="button"
            data-index={index}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
              index === selectedIndex ? "bg-accent" : "hover:bg-accent/60"
            }`}
            onMouseDown={chooseFromPointer}
          >
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            <span className="text-[10px] text-muted-foreground uppercase">
              {item.kind.replace("_", " ")}
            </span>
          </button>
        ))
      )}
    </div>
  )
})
MentionList.displayName = "MentionList"

const plainDocument = (text: string): JSONContent => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: text ? [{ type: "text", text }] : [],
    },
  ],
})

export const AgentComposer = forwardRef<
  AgentComposerHandle,
  {
    candidates: AgentMentionValue[]
    disabled: boolean
    draftText: string
    initialSnapshot?: AgentComposerSnapshot
    onDraftTextChange: (value: string) => void
    onSubmit: () => void
  }
>(
  (
    {
      candidates,
      disabled,
      draftText,
      initialSnapshot,
      onDraftTextChange,
      onSubmit,
    },
    ref
  ) => {
    const candidatesRef = useRef(candidates)
    const mentionOpenRef = useRef(false)
    const onDraftTextChangeRef = useRef(onDraftTextChange)
    const onSubmitRef = useRef(onSubmit)
    useEffect(() => {
      candidatesRef.current = candidates
      onDraftTextChangeRef.current = onDraftTextChange
      onSubmitRef.current = onSubmit
    }, [candidates, onDraftTextChange, onSubmit])
    const extensions = useMemo(
      () => [
        StarterKit.configure({ heading: false, codeBlock: false }),
        Placeholder.configure({
          placeholder:
            "Describe the issue, or attach screenshots for analysis.",
        }),
        ContextMentionNode.configure({
          deleteTriggerWithBackspace: true,
          renderText: ({ node }) => `@${String(node.attrs.label ?? "context")}`,
          suggestion: {
            items: ({ query }) => {
              const normalized = query.toLocaleLowerCase()
              return candidatesRef.current
                .filter(
                  (candidate) =>
                    normalized.length === 0 ||
                    candidate.label.toLocaleLowerCase().includes(normalized)
                )
                .slice(0, 10)
            },
            render: () => {
              let renderer: ReactRenderer<MentionListHandle> | undefined
              let popup: HTMLDivElement | undefined
              const position = (props: SuggestionProps<AgentMentionValue>) => {
                const rect = props.clientRect?.()
                if (!rect || !popup) return
                popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 296))}px`
                popup.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 280)}px`
              }
              return {
                onStart: (props) => {
                  mentionOpenRef.current = true
                  renderer = new ReactRenderer(MentionList, {
                    editor: props.editor,
                    props,
                  })
                  popup = document.createElement("div")
                  popup.className = "fixed z-50"
                  popup.append(renderer.element)
                  document.body.append(popup)
                  position(props)
                },
                onUpdate: (props) => {
                  renderer?.updateProps(props)
                  position(props)
                },
                onKeyDown: (props) => renderer?.ref?.onKeyDown(props) ?? false,
                onExit: () => {
                  mentionOpenRef.current = false
                  renderer?.destroy()
                  popup?.remove()
                },
              }
            },
          },
        }).extend({
          addNodeView: () => ReactNodeViewRenderer(ContextMentionView),
        }),
      ],
      []
    )
    const editor = useEditor(
      {
        extensions,
        content: initialSnapshot?.document ?? plainDocument(draftText),
        editable: !disabled,
        immediatelyRender: false,
        editorProps: {
          attributes: {
            class:
              "max-h-[40vh] min-h-24 overflow-y-auto px-3 py-3 text-sm outline-none",
            "aria-label": "Agent message",
            "aria-multiline": "true",
            placeholder:
              "Describe the issue, or attach screenshots for analysis.",
            role: "textbox",
          },
          handleKeyDown: (_view, event) => {
            if (event.key !== "Enter" || event.isComposing) {
              return false
            }
            if (event.shiftKey) {
              event.preventDefault()
              return splitBlock(_view.state, _view.dispatch)
            }
            if (mentionOpenRef.current) return false
            event.preventDefault()
            onSubmitRef.current()
            return true
          },
        },
        onUpdate: ({ editor: current }) =>
          onDraftTextChangeRef.current(
            current.getText({ blockSeparator: "\n" })
          ),
      },
      [extensions]
    )

    useEffect(() => editor?.setEditable(!disabled), [disabled, editor])
    useEffect(() => {
      if (!editor) return
      const current = editor.getText({ blockSeparator: "\n" })
      if (current === draftText) return
      // Parent state can lag behind Tiptap transactions during rapid input.
      // Reapplying that stale value would discard characters already entered.
      if (editor.isFocused) return
      if (draftText === "" && current !== "") return
      editor.commands.setContent(plainDocument(draftText))
    }, [draftText, editor])

    useImperativeHandle(
      ref,
      () => ({
        clear: () => editor?.commands.clearContent(true),
        focus: () => editor?.commands.focus(),
        restore: (snapshot) => editor?.commands.setContent(snapshot.document),
        snapshot: () => {
          const document = editor?.getJSON() ?? plainDocument("")
          return { document, parts: agentComposerDocumentToParts(document) }
        },
      }),
      [editor]
    )

    return (
      <EditorContent
        editor={editor}
        className="min-w-0 rounded-2xl bg-muted/70 [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:h-0 [&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]"
      />
    )
  }
)
AgentComposer.displayName = "AgentComposer"
