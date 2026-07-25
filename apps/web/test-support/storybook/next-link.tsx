import type { AnchorHTMLAttributes, ReactNode } from "react"

type StorybookLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> & {
  children?: ReactNode
  href: string | { pathname?: string }
}

const StorybookLink = ({ children, href, ...props }: StorybookLinkProps) => (
  <a href={typeof href === "string" ? href : (href.pathname ?? "/")} {...props}>
    {children}
  </a>
)

export default StorybookLink
