import { render } from "@react-email/render"
import type { ReactElement } from "react"

export const renderEmail = async (component: ReactElement) => {
  const html = await render(component)
  const text = await render(component, { plainText: true })

  return { html, text }
}
