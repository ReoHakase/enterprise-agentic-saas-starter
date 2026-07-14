import { expectTypeOf, it } from "vitest"

import type { CreateApiClientOptions } from "./client"

it("does not expose Eden date parsing as a consumer option", () => {
  type HasParseDate = "parseDate" extends keyof CreateApiClientOptions
    ? true
    : false

  expectTypeOf<HasParseDate>().toEqualTypeOf<false>()
})
