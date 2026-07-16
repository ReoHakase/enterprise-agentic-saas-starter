import type { ComponentType, ReactNode } from "react"

export const PageHeader = ({ children }: { children: ReactNode }) => (
  <div
    data-slot="page-header"
    className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
  >
    {children}
  </div>
)

export const PageHeaderCopy = ({ children }: { children: ReactNode }) => (
  <div className="min-w-0">{children}</div>
)

export const PageHeaderDescription = ({
  children,
}: {
  children?: ReactNode
}) => (
  <div
    data-slot="page-description"
    className="mt-1 h-10 overflow-hidden sm:h-5"
    aria-hidden={children ? undefined : true}
  >
    {children}
  </div>
)

export const PageShell = ({
  title,
  description,
  action: Action,
  children,
}: {
  title: string
  description?: string
  action?: ComponentType
  children: ReactNode
}) => (
  <div
    data-slot="page-shell"
    className="flex w-full max-w-full min-w-0 flex-col gap-6 xl:max-w-7xl"
  >
    <PageHeader>
      <PageHeaderCopy>
        <h1
          tabIndex={-1}
          className="text-2xl font-semibold tracking-normal outline-none"
        >
          {title}
        </h1>
        <PageHeaderDescription>
          {description ? (
            <p className="max-w-2xl text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </PageHeaderDescription>
      </PageHeaderCopy>
      {Action ? <Action /> : null}
    </PageHeader>
    <div data-slot="page-body" className="max-w-full min-w-0">
      {children}
    </div>
  </div>
)
