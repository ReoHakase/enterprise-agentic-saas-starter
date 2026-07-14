import type { ReactNode } from "react"

export const PageHeader = ({
  heading,
  description,
  actions,
}: {
  heading: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) => (
  <div
    data-slot="page-header"
    className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
  >
    <div className="min-w-0">
      {heading}
      <div
        data-slot="page-description"
        className="mt-1 h-10 overflow-hidden sm:h-5"
        aria-hidden={description ? undefined : true}
      >
        {description}
      </div>
    </div>
    {actions}
  </div>
)

export const PageShell = ({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) => (
  <div
    data-slot="page-shell"
    className="flex w-full max-w-full min-w-0 flex-col gap-6 xl:max-w-7xl"
  >
    <PageHeader
      heading={
        <h1
          tabIndex={-1}
          className="text-2xl font-semibold tracking-normal outline-none"
        >
          {title}
        </h1>
      }
      description={
        description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : undefined
      }
      actions={actions}
    />
    <div data-slot="page-body">{children}</div>
  </div>
)
