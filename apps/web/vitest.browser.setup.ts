import "@enterprise-agentic-saas/ui/globals.css"
import {
  createNavigation,
  usePathname,
  useRouter,
} from "@storybook/nextjs-vite/navigation.mock"
import * as testingLibraryMatchers from "@testing-library/jest-dom/vitest"
import { beforeEach } from "vitest"

void testingLibraryMatchers

beforeEach(() => {
  const router = createNavigation({})

  usePathname.mockReturnValue("/dashboard")
  useRouter.mockReturnValue(router)
})
