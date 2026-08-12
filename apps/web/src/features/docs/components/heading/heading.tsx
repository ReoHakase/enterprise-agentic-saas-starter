import type { ComponentPropsWithoutRef, ReactNode } from "react"

import { HeadingAnchor } from "../heading-anchor/heading-anchor"

type HeadingProps = ComponentPropsWithoutRef<"h2"> & {
  children?: ReactNode
}

const Heading = ({ children, id, className, ...props }: HeadingProps) => (
  <h2 id={id} className={`group ${className ?? ""}`} {...props}>
    {children}
    {id ? <HeadingAnchor id={id} title={getHeadingTitle(children)} /> : null}
  </h2>
)

export const H2 = (props: HeadingProps) => <Heading {...props} />

export const H3 = ({ children, id, className, ...props }: HeadingProps) => (
  <h3 id={id} className={`group ${className ?? ""}`} {...props}>
    {children}
    {id ? <HeadingAnchor id={id} title={getHeadingTitle(children)} /> : null}
  </h3>
)

export const H4 = ({ children, id, className, ...props }: HeadingProps) => (
  <h4 id={id} className={`group ${className ?? ""}`} {...props}>
    {children}
    {id ? <HeadingAnchor id={id} title={getHeadingTitle(children)} /> : null}
  </h4>
)

const getHeadingTitle = (children: ReactNode): string => {
  if (typeof children === "string" || typeof children === "number") {
    return String(children)
  }

  return "heading"
}
