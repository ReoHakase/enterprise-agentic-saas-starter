"use client"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@enterprise-agentic-saas/ui/components/alert-dialog"

const shortcuts = [
  ["⌘/Ctrl K", "Toggle Agent pane"],
  ["⌘/Ctrl Enter", "Send message"],
  ["⌘/Ctrl Shift N", "New thread"],
  ["⌘/Ctrl .", "Stop response"],
  ["Alt ↑ / ↓", "Move between threads"],
  ["⌘/Ctrl /", "Show shortcuts"],
] as const

export const AgentShortcutHelp = ({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Agent shortcuts</AlertDialogTitle>
        <AlertDialogDescription>
          Keyboard commands are disabled while using an IME composition.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {shortcuts.map(([key, description]) => (
          <div key={key} className="contents">
            <kbd className="rounded border bg-muted px-2 py-1 font-mono text-xs">
              {key}
            </kbd>
            <span className="py-1">{description}</span>
          </div>
        ))}
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>Close</AlertDialogCancel>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)
