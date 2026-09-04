import { fn } from "storybook/test"

import preview from "#storybook/preview"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog/alert-dialog"
import { Button } from "./button/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog/dialog"
import { Input } from "./input/input"

const primaryButton = <Button />
const outlineButton = <Button variant="outline" />
const destructiveButton = <Button variant="destructive" />

const OrganizationOverlays = ({ onDelete }: { onDelete: () => void }) => (
  <div className="flex flex-wrap gap-3">
    <Dialog>
      <DialogTrigger render={outlineButton}>Rename organization</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename Acme Cloud</DialogTitle>
          <DialogDescription>
            The new name is shown to all organization members.
          </DialogDescription>
        </DialogHeader>
        <Input aria-label="Organization name" defaultValue="Acme Cloud" />
        <DialogFooter>
          <DialogClose render={outlineButton}>Cancel</DialogClose>
          <DialogClose render={primaryButton}>Save name</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AlertDialog>
      <AlertDialogTrigger render={destructiveButton}>
        Delete organization
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Acme Cloud?</AlertDialogTitle>
          <AlertDialogDescription>
            24 members and 8 projects lose access immediately.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep organization</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDelete}>
            Permanently delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
)

const meta = preview.type<{ args: { onDelete: () => void } }>().meta({
  title: "Workflows/Overlay",
  component: OrganizationOverlays,
  tags: ["autodocs"],
  args: { onDelete: fn() },
})

export const RenameAndDelete = meta.story({})
