import type { ComponentPropsWithoutRef, ReactNode } from "react"

import { DocsHeadingAnchor } from "../docs-heading-anchor/docs-heading-anchor"

type HeadingProps = ComponentPropsWithoutRef<"h2"> & {
  children?: ReactNode
}

const DocsHeading = ({ children, id, className, ...props }: HeadingProps) => (
  <h2 id={id} className={`group ${className ?? ""}`} {...props}>
    {children}
    {id ? (
      <DocsHeadingAnchor id={id} title={getHeadingTitle(children)} />
    ) : null}
  </h2>
)

export const DocsH2 = (props: HeadingProps) => <DocsHeading {...props} />

export const DocsH3 = ({ children, id, className, ...props }: HeadingProps) => (
  <h3 id={id} className={`group ${className ?? ""}`} {...props}>
    {children}
    {id ? (
      <DocsHeadingAnchor id={id} title={getHeadingTitle(children)} />
    ) : null}
  </h3>
)

export const DocsH4 = ({ children, id, className, ...props }: HeadingProps) => (
  <h4 id={id} className={`group ${className ?? ""}`} {...props}>
    {children}
    {id ? (
      <DocsHeadingAnchor id={id} title={getHeadingTitle(children)} />
    ) : null}
  </h4>
)

const getHeadingTitle = (children: ReactNode): string => {
  if (typeof children === "string" || typeof children === "number") {
    return String(children)
  }

  return "heading"
}
