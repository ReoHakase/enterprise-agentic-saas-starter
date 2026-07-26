import preview from "#storybook/preview"

import { Skeleton } from "./skeleton"

const meta = preview.meta({
  title: "Components/Skeleton",
  component: Skeleton,
  tags: ["autodocs"],
})

export const MemberCardLoading = meta.story({
  render: () => (
    <section
      aria-label="Loading member details"
      aria-busy="true"
      className="flex w-80 items-center gap-3 rounded-lg border p-4"
    >
      <Skeleton className="size-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
    </section>
  ),
})

export const TableLoading = meta.story({
  render: () => (
    <section aria-label="Loading issues" aria-busy="true" className="w-xl">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex gap-4 border-b p-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </section>
  ),
})
