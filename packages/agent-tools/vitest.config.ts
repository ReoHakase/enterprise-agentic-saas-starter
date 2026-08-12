import { defineProject } from "vitest/config"

export default defineProject({
  root: import.meta.dirname,
  test: {
    name: "agent-tools-unit",
  },
})
