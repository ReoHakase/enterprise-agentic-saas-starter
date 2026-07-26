import { describe, expect, it } from "vitest"

import { webSearchLinksFromToolOutput } from "./web-search-links"

describe("Web search links", () => {
  it("returns only bounded public HTTP sources from Web search output", () => {
    expect(
      webSearchLinksFromToolOutput("web_search", {
        sources: [
          {
            title: "Cloudflare Workers limits",
            url: "https://developers.cloudflare.com/workers/platform/limits/",
          },
          {
            title: "Private host",
            url: "http://127.0.0.1/internal",
          },
          {
            title: "Unsafe protocol",
            url: "javascript:alert(1)",
          },
        ],
      })
    ).toEqual([
      {
        title: "Cloudflare Workers limits",
        url: "https://developers.cloudflare.com/workers/platform/limits/",
      },
    ])
  })

  it("rejects other tools and malformed or unbounded output", () => {
    expect(
      webSearchLinksFromToolOutput("search_issues", {
        sources: [
          {
            title: "Public source",
            url: "https://example.com/",
          },
        ],
      })
    ).toEqual([])
    expect(
      webSearchLinksFromToolOutput("web_search", { sources: "bad" })
    ).toEqual([])
    expect(
      webSearchLinksFromToolOutput("web_search", {
        sources: Array.from({ length: 6 }, (_, index) => ({
          title: `Source ${index}`,
          url: `https://example.com/${index}`,
        })),
      })
    ).toEqual([])
  })
})
