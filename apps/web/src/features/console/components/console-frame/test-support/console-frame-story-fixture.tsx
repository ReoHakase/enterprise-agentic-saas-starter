import { SidebarProvider } from "@enterprise-agentic-saas/ui/components/sidebar"

import {
  ConsoleFrame,
  ConsoleFrameContent,
  ConsoleFrameHeader,
} from "../console-frame"

export const ConsoleFrameStoryFixture = () => (
  <SidebarProvider>
    <ConsoleFrame>
      <ConsoleFrameHeader>Acme Cloud · 8 members</ConsoleFrameHeader>
      <ConsoleFrameContent>
        <div className="h-320 rounded-2xl border p-5">
          Scrollable tenant content
        </div>
      </ConsoleFrameContent>
    </ConsoleFrame>
  </SidebarProvider>
)
