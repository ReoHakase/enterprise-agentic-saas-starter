import type { AnchorHTMLAttributes, ReactNode } from "react"

type StorybookLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> & {
  children?: ReactNode
  href: string | { pathname?: string }
  prefetch?: boolean
}

const StorybookLink = ({
  children,
  href,
  prefetch: _prefetch,
  ...props
}: StorybookLinkProps) => (
  <a href={typeof href === "string" ? href : (href.pathname ?? "/")} {...props}>
    {children}
  </a>
)

export default StorybookLink
