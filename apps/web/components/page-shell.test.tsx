import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { PageShell } from "./page-shell"

describe("PageShell", () => {
  it("reserves the same two-line mobile description slot as route boundaries", () => {
    const markup = renderToString(
      <PageShell title="Overview" description="A short description.">
        <div>Page body</div>
      </PageShell>
    )

    expect(markup).toContain('data-slot="page-description"')
    expect(markup).toContain("h-10 overflow-hidden sm:h-5")
  })
})
