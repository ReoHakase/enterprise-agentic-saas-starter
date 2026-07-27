import { NuqsTestingAdapter } from "nuqs/adapters/testing"
import { createElement, type ComponentProps, type ReactElement } from "react"

export const NuqsAdapter = (
  props: ComponentProps<typeof NuqsTestingAdapter>
): ReactElement =>
  createElement(NuqsTestingAdapter, { hasMemory: true, ...props })
