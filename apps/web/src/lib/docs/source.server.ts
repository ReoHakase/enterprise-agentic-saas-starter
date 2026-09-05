import { docs } from "collections/server"
import { loader } from "fumadocs-core/source"
import { lucideIconsPlugin } from "fumadocs-core/source/plugins/lucide-icons"
import { createElement, type ReactNode } from "react"

const emojiPattern = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u

const resolveIcon = (icon: string | undefined): ReactNode =>
  icon && emojiPattern.test(icon)
    ? createElement("span", { "aria-hidden": true }, icon)
    : icon

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  icon: resolveIcon,
  plugins: [lucideIconsPlugin()],
})
