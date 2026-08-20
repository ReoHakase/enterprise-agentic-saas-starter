import { defineProject } from "vitest/config"

export default defineProject({
  root: import.meta.dirname,
  test: {
    name: "api-unit",
    setupFiles: ["./vitest.setup.ts"],
  },
})
