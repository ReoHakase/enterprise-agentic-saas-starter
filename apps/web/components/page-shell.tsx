import type { ReactNode } from "react"

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
    <div
      data-slot="page-header"
      className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="min-w-0">
        <h1
          tabIndex={-1}
          className="text-2xl font-semibold tracking-normal outline-none"
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions}
    </div>
    <div data-slot="page-body">{children}</div>
  </div>
)
