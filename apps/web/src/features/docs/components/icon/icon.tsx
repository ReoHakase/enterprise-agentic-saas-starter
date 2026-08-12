import { FileTextIcon, icons } from "lucide-react"
import type { ComponentProps } from "react"

const lucideIcons: Record<string, typeof FileTextIcon> = icons

type IconProps = Omit<ComponentProps<"span">, "children"> & {
  icon?: string
}

export const Icon = ({ icon, className, ...props }: IconProps) => {
  const LucideIcon = icon ? lucideIcons[icon] : undefined

  if (LucideIcon) {
    return <LucideIcon aria-hidden="true" className={className} />
  }

  if (icon) {
    return (
      <span aria-hidden="true" className={className} {...props}>
        {icon}
      </span>
    )
  }

  return <FileTextIcon aria-hidden="true" className={className} />
}
