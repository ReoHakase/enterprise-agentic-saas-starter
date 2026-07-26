"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@enterprise-agentic-saas/ui/components/select"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import {
  ArchiveIcon,
  CheckIcon,
  MessageSquareIcon,
  MessageSquarePlusIcon,
  PencilIcon,
  XIcon,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react"

import { LocalDate } from "@/components/local-date/local-date"

import type { AgentThread } from "../../schema"

export const AgentThreadToolbar = ({
  threads,
  selectedThread,
  loading,
  error,
  creating,
  archiving,
  renaming,
  disabled,
  onSelect,
  onCreate,
  onArchive,
  onRename,
}: {
  threads: AgentThread[]
  selectedThread?: AgentThread
  loading: boolean
  error: boolean
  creating: boolean
  archiving: boolean
  renaming: boolean
  disabled: boolean
  onSelect: (threadId: string) => void
  onCreate: () => void
  onArchive: (threadId: string) => void
  onRename: (thread: AgentThread, title: string) => void
}) => {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(selectedThread?.title ?? "")
  const titleInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    setEditing(false)
    setTitle(selectedThread?.title ?? "")
  }, [selectedThread?.id, selectedThread?.title])
  useEffect(() => {
    if (!editing) return
    const frame = requestAnimationFrame(() => {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [editing])
  const items = useMemo(
    () => threads.map((thread) => ({ label: thread.title, value: thread.id })),
    [threads]
  )
  const selectThread = useCallback(
    (threadId: string | null) => {
      if (threadId) onSelect(threadId)
    },
    [onSelect]
  )
  const archiveThread = useCallback(() => {
    if (selectedThread) onArchive(selectedThread.id)
  }, [onArchive, selectedThread])
  const submitRename = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const nextTitle = title.trim()
      if (!selectedThread || !nextTitle || nextTitle === selectedThread.title) {
        setEditing(false)
        return
      }
      onRename(selectedThread, nextTitle)
    },
    [onRename, selectedThread, title]
  )
  const changeTitle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setTitle(event.target.value),
    []
  )
  const cancelEditing = useCallback(() => setEditing(false), [])
  const beginEditing = useCallback(() => setEditing(true), [])

  return (
    <div className="shrink-0 space-y-2 rounded-xl border bg-card p-2">
      <div className="flex min-w-0 items-center gap-2">
        {editing && selectedThread ? (
          <form className="flex min-w-0 flex-1 gap-1" onSubmit={submitRename}>
            <Input
              ref={titleInputRef}
              value={title}
              maxLength={80}
              aria-label="Thread title"
              disabled={disabled || renaming}
              onChange={changeTitle}
            />
            <Button
              type="submit"
              size="icon-sm"
              variant="outline"
              aria-label="Save thread title"
              disabled={disabled || renaming || title.trim().length === 0}
            >
              {renaming ? <Spinner /> : <CheckIcon />}
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Cancel thread title edit"
              disabled={renaming}
              onClick={cancelEditing}
            >
              <XIcon />
            </Button>
          </form>
        ) : (
          <Select
            items={items}
            value={selectedThread?.id ?? ""}
            disabled={disabled || loading || threads.length === 0}
            onValueChange={selectThread}
          >
            <SelectTrigger className="min-w-0 flex-1" aria-label="Agent thread">
              <MessageSquareIcon aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-left">
                {selectedThread?.title ??
                  (loading ? "Loading threads…" : "New conversation")}
              </span>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {threads.map((thread) => (
                  <SelectItem key={thread.id} value={thread.id}>
                    <div className="min-w-0 py-0.5">
                      <span className="block truncate">{thread.title}</span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <MessageSquareIcon
                            className="size-3"
                            aria-hidden="true"
                          />
                          {thread.messageCount}
                        </span>
                        <LocalDate value={thread.updatedAt} includeTime />
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
        {!editing ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Rename thread"
            disabled={disabled || renaming || !selectedThread}
            onClick={beginEditing}
          >
            <PencilIcon aria-hidden="true" />
          </Button>
        ) : null}
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label="New agent thread"
          disabled={disabled || creating}
          onClick={onCreate}
        >
          {creating ? (
            <Spinner />
          ) : (
            <MessageSquarePlusIcon aria-hidden="true" />
          )}
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="destructive"
          aria-label={
            selectedThread
              ? `Archive ${selectedThread.title}`
              : "Archive thread"
          }
          disabled={disabled || archiving || !selectedThread}
          onClick={archiveThread}
        >
          <ArchiveIcon aria-hidden="true" />
        </Button>
      </div>
      {error ? (
        <p role="alert" className="px-1 text-xs text-destructive">
          Agent threads could not be loaded.
        </p>
      ) : null}
      {!loading && !error && threads.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          Create a private thread to start.
        </p>
      ) : null}
    </div>
  )
}

export const AgentThreadItem = ({
  thread,
  selected,
  disabled,
  onSelect,
  onArchive,
}: {
  thread: AgentThread
  selected: boolean
  disabled: boolean
  onSelect: (threadId: string) => void
  onArchive: (threadId: string) => void
}) => {
  const select = useCallback(() => onSelect(thread.id), [onSelect, thread.id])
  const archive = useCallback(
    () => onArchive(thread.id),
    [onArchive, thread.id]
  )
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Button
        className="min-w-0 flex-1 justify-start"
        variant={selected ? "secondary" : "ghost"}
        disabled={disabled}
        onClick={select}
      >
        <span className="truncate">{thread.title}</span>
      </Button>
      <Button
        size="icon-sm"
        variant="destructive"
        aria-label={`Archive ${thread.title}`}
        disabled={disabled}
        onClick={archive}
      >
        <ArchiveIcon />
      </Button>
    </div>
  )
}
