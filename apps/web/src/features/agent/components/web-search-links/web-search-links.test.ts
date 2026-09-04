import { describe, expect, it } from "vitest"

import { webSearchLinksFromToolOutput } from "./web-search-links"

describe("Web 検索リンク", () => {
  it("Web検索結果から許可された公開HTTP情報源だけを返す", () => {
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

  it.each([
    {
      caseLabel: "Web検索以外のtool",
      toolName: "search_issues",
      output: {
        sources: [
          {
            title: "Public source",
            url: "https://example.com/",
          },
        ],
      },
    },
    {
      caseLabel: "配列でないsources",
      toolName: "web_search",
      output: { sources: "bad" },
    },
    {
      caseLabel: "上限を超えるsources",
      toolName: "web_search",
      output: {
        sources: Array.from({ length: 6 }, (_, index) => ({
          title: `Source ${index}`,
          url: `https://example.com/${index}`,
        })),
      },
    },
  ])("$caseLabelのoutputを拒否する", ({ output, toolName }) => {
    expect(webSearchLinksFromToolOutput(toolName, output)).toEqual([])
  })
})
