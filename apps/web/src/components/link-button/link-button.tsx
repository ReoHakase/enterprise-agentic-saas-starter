import {
  buttonVariants,
  type Button,
} from "@enterprise-agentic-saas/ui/components/button"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import Link from "next/link"
import type { ComponentProps } from "react"

type LinkButtonProps = ComponentProps<typeof Link> &
  Pick<ComponentProps<typeof Button>, "size" | "variant">

/**
 * Next.js navigation with the shared button visual language.
 *
 * A link remains an anchor instead of being composed through Base UI's
 * `render` prop, so navigation semantics and its rendered element stay stable.
 */
export const LinkButton = ({
  className,
  size = "default",
  variant = "default",
  ...props
}: LinkButtonProps) => (
  <Link
    data-slot="button"
    className={cn(buttonVariants({ size, variant }), className)}
    {...props}
  />
)
