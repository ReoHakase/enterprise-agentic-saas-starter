"use client"

import { Check, Loader2, Plus, Trash2 } from "lucide-react"
import { useCallback, type ChangeEvent, type FormEvent } from "react"

import { cn } from "../lib/utils"
import { Button } from "./button"
import { Card, CardContent } from "./card"
import { Checkbox } from "./checkbox"
import { Input } from "./input"

export type TodoUiItem = {
  id: string
  title: string
  completed: boolean
}

export type TodoWorkspaceProps = {
  todos: TodoUiItem[]
  pending?: boolean
  busyTodoId?: string
  title: string
  onTitleChange: (title: string) => void
  onCreate: () => void
  onToggle: (todo: TodoUiItem) => void
  onDelete: (todo: TodoUiItem) => void
}

export const TodoWorkspace = ({
  todos,
  pending,
  busyTodoId,
  title,
  onTitleChange,
  onCreate,
  onToggle,
  onDelete,
}: TodoWorkspaceProps) => {
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      onCreate()
    },
    [onCreate]
  )
  const handleTitleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onTitleChange(event.target.value)
    },
    [onTitleChange]
  )

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
        <Input
          value={title}
          onChange={handleTitleChange}
          placeholder="New todo"
          aria-label="New todo"
          className="min-w-0 flex-1"
        />
        <Button
          type="submit"
          disabled={pending || title.trim().length === 0}
          className="shrink-0"
        >
          {pending ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <Plus data-icon="inline-start" />
          )}
          Add
        </Button>
      </form>

      <div className="flex flex-col gap-3">
        {todos.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              No todos yet.
            </CardContent>
          </Card>
        ) : (
          todos.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              busy={busyTodoId === todo.id}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </section>
  )
}

type TodoRowProps = {
  todo: TodoUiItem
  busy: boolean
  onToggle: (todo: TodoUiItem) => void
  onDelete: (todo: TodoUiItem) => void
}

const TodoRow = ({ todo, busy, onToggle, onDelete }: TodoRowProps) => {
  const handleToggle = useCallback(() => {
    onToggle(todo)
  }, [onToggle, todo])
  const handleDelete = useCallback(() => {
    onDelete(todo)
  }, [onDelete, todo])

  return (
    <Card size="sm" className="overflow-hidden">
      <CardContent className="flex items-center gap-3 py-3">
        <Checkbox
          checked={todo.completed}
          disabled={busy}
          onCheckedChange={handleToggle}
          aria-label={todo.completed ? "Mark incomplete" : "Mark complete"}
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            todo.completed && "text-muted-foreground line-through"
          )}
        >
          {todo.title}
        </span>
        {todo.completed ? (
          <Check className="size-4 text-muted-foreground" />
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy}
          onClick={handleDelete}
          aria-label="Delete todo"
        >
          {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
        </Button>
      </CardContent>
    </Card>
  )
}
