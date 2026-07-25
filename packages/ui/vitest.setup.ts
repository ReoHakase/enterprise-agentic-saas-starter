import * as testingLibraryMatchers from "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

void testingLibraryMatchers

afterEach(() => cleanup())
