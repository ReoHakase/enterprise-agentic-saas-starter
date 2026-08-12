import { FileTextIcon, icons } from "lucide-react"
import type { ComponentProps } from "react"

const lucideIcons: Record<string, typeof FileTextIcon> = icons

type DocsIconProps = Omit<ComponentProps<"span">, "children"> & {
  icon?: string
}

export const DocsIcon = ({ icon, className, ...props }: DocsIconProps) => {
  const Icon = icon ? lucideIcons[icon] : undefined

  if (Icon) {
    return <Icon aria-hidden="true" className={className} />
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
