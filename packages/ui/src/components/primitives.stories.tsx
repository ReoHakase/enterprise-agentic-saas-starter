import type { Meta, StoryObj } from "@storybook/react-vite"
import { CalendarIcon, SearchIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { fn } from "storybook/test"

import { Button } from "./button"
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from "./button-group"
import { Calendar, CalendarDayButton } from "./calendar"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card"
import { Checkbox } from "./checkbox"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxValue,
} from "./combobox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./empty"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "./field"
import { ImageCropper } from "./image-cropper"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "./input-group"
import { Label } from "./label"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "./popover"
import { ScrollArea, ScrollBar } from "./scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select"
import { Separator } from "./separator"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet"
import { Skeleton } from "./skeleton"
import { Slider } from "./slider"
import { Toaster } from "./sonner"
import { Spinner } from "./spinner"
import { Switch } from "./switch"
import { Textarea } from "./textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip"

const options = ["Alpha", "Beta", "Gamma"]
const calendarComponents = { DayButton: CalendarDayButton }
const calendarDefaultMonth = new Date(2026, 6, 1)
const calendarSelectedDate = new Date(2026, 6, 24)
const comboboxDefaultValues = ["Alpha"]
const dropdownTrigger = <Button variant="outline" />
const fieldErrors = [{ message: "Use a verified address." }]
const popoverTrigger = <Button variant="outline" />
const selectItems = { admin: "Admin", member: "Member" }
const sheetCloseRender = <Button variant="outline" />
const sheetTrigger = <Button variant="outline" />
const sliderAriaLabel = () => "Priority threshold"
const tooltipTrigger = <Button variant="outline" />

const StaticPrimitivesFixture = () => (
  <Card className="w-[min(36rem,calc(100vw-2rem))]">
    <CardHeader>
      <CardTitle>Primitive inventory</CardTitle>
      <CardDescription>
        Keyboard, form, progress, and layout primitives in one stable state.
      </CardDescription>
      <CardAction>
        <Button size="sm" variant="outline">
          Edit
        </Button>
      </CardAction>
    </CardHeader>
    <CardContent className="grid gap-5">
      <div className="flex flex-wrap items-center gap-4">
        <Label className="flex items-center gap-2">
          <Checkbox defaultChecked /> Include completed
        </Label>
        <Label className="flex items-center gap-2">
          <Switch defaultChecked /> Email updates
        </Label>
        <Spinner aria-label="Saving changes" />
      </div>
      <Slider
        aria-label="Priority threshold"
        defaultValue={40}
        getAriaLabel={sliderAriaLabel}
      />
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon aria-hidden="true" />
          <InputGroupText className="text-foreground">Search</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput aria-label="Search workspace" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton aria-label="Run search">
            <SearchIcon aria-hidden="true" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupTextarea
          aria-label="Long issue description"
          defaultValue="A deterministic multiline description."
        />
      </InputGroup>
      <FieldSet>
        <FieldLegend>Notification policy</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldContent>
              <FieldLabel htmlFor="notification-email">Email</FieldLabel>
              <FieldTitle>Primary recipient</FieldTitle>
              <FieldDescription>
                Alerts are scoped to the active organization.
              </FieldDescription>
            </FieldContent>
            <input
              id="notification-email"
              className="rounded-xl border px-3 py-2"
              defaultValue="owner@example.test"
            />
            <FieldError errors={fieldErrors} />
          </Field>
          <FieldSeparator>or</FieldSeparator>
        </FieldGroup>
      </FieldSet>
      <Textarea
        aria-label="Issue summary"
        defaultValue="Review access policy."
      />
      <ButtonGroup>
        <Button variant="outline">Back</Button>
        <ButtonGroupSeparator />
        <ButtonGroupText>Step 2 of 3</ButtonGroupText>
        <Button>Continue</Button>
      </ButtonGroup>
      <Separator />
      <ScrollArea className="h-24 rounded-xl border p-3">
        <p>
          This scroll region intentionally contains enough copy to exercise the
          keyboard-accessible viewport. Tenant-scoped actions remain visible
          while longer descriptions scroll independently.
        </p>
        <p className="mt-4">
          The second paragraph provides deterministic overflow without relying
          on generated content.
        </p>
        <ScrollBar orientation="vertical" />
      </ScrollArea>
      <Skeleton className="h-8 w-full" />
    </CardContent>
    <CardFooter>
      <Empty className="w-full border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No scheduled changes</EmptyTitle>
          <EmptyDescription>
            Planned tenant changes will appear here.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline">Create schedule</Button>
        </EmptyContent>
      </Empty>
    </CardFooter>
  </Card>
)

const SelectionPrimitivesFixture = () => (
  <div className="grid w-[min(36rem,calc(100vw-2rem))] gap-5 rounded-2xl border p-5">
    <Combobox items={options}>
      <ComboboxInput
        aria-label="Organization"
        placeholder="Choose organization"
        showTrigger={false}
      />
      <ComboboxContent>
        <ComboboxEmpty>No organization found.</ComboboxEmpty>
        <ComboboxList>
          <ComboboxGroup>
            <ComboboxLabel>Organizations</ComboboxLabel>
            <ComboboxCollection>
              {(option: string) => (
                <ComboboxItem key={option} value={option}>
                  {option}
                </ComboboxItem>
              )}
            </ComboboxCollection>
          </ComboboxGroup>
          <ComboboxSeparator />
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
    <Combobox items={options} multiple defaultValue={comboboxDefaultValues}>
      <ComboboxChips>
        <ComboboxChip showRemove={false}>Alpha</ComboboxChip>
        <ComboboxChipsInput aria-label="Add organization label" />
        <ComboboxTrigger aria-label="Show organization labels" />
        <ComboboxValue />
      </ComboboxChips>
    </Combobox>
    <Select defaultValue="member" items={selectItems}>
      <SelectTrigger aria-label="Role">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectScrollUpButton />
        <SelectGroup>
          <SelectLabel>Organization role</SelectLabel>
          <SelectItem value="admin">Admin</SelectItem>
          <SelectSeparator />
          <SelectItem value="member">Member</SelectItem>
        </SelectGroup>
        <SelectScrollDownButton />
      </SelectContent>
    </Select>
    <Calendar
      mode="single"
      defaultMonth={calendarDefaultMonth}
      selected={calendarSelectedDate}
      components={calendarComponents}
    />
  </div>
)

const OverlayPrimitivesFixture = () => (
  <TooltipProvider>
    <div className="flex flex-wrap gap-3">
      <DropdownMenu>
        <DropdownMenuTrigger render={dropdownTrigger}>
          Open menu
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Workspace</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem>
              Overview
              <DropdownMenuShortcut>⌘1</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuCheckboxItem checked>
              Show archived issues
            </DropdownMenuCheckboxItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value="issues">
            <DropdownMenuRadioItem value="overview">
              Overview
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="issues">Issues</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>More</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Members</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
        <DropdownMenuPortal>
          <span />
        </DropdownMenuPortal>
      </DropdownMenu>
      <Popover>
        <PopoverTrigger render={popoverTrigger}>Show details</PopoverTrigger>
        <PopoverContent>
          <PopoverHeader>
            <PopoverTitle>Tenant boundary</PopoverTitle>
            <PopoverDescription>
              Actions apply only to the active organization.
            </PopoverDescription>
          </PopoverHeader>
        </PopoverContent>
      </Popover>
      <Sheet>
        <SheetTrigger render={sheetTrigger}>Open sheet</SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Organization settings</SheetTitle>
            <SheetDescription>
              Review tenant-scoped configuration.
            </SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <SheetClose render={sheetCloseRender}>Close</SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <Tooltip>
        <TooltipTrigger render={tooltipTrigger}>Context</TooltipTrigger>
        <TooltipContent>12% of the context window is used.</TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
)

const CropperFixture = () => {
  const source = useMemo(
    () =>
      new Blob(
        [
          Uint8Array.from(
            atob(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
            ),
            (character) => character.codePointAt(0) ?? 0
          ),
        ],
        { type: "image/png" }
      ),
    []
  )
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)

  return (
    <div className="grid w-[min(28rem,calc(100vw-2rem))] gap-4">
      <ImageCropper
        source={source}
        crop={crop}
        zoom={zoom}
        onCropChange={setCrop}
        onCropComplete={fn()}
        onZoomChange={setZoom}
      />
      <Toaster />
    </div>
  )
}

const meta = {
  title: "Components/Primitive Inventory",
  component: Card,
  tags: ["autodocs", "theme-sensitive"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

export const StaticPrimitives: Story = {
  render: () => <StaticPrimitivesFixture />,
}

export const SelectionPrimitives: Story = {
  render: () => <SelectionPrimitivesFixture />,
}

export const OverlayPrimitives: Story = {
  render: () => <OverlayPrimitivesFixture />,
}

export const ImageCropAndToast: Story = {
  render: () => <CropperFixture />,
}
