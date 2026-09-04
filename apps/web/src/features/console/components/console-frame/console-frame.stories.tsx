import preview from "#storybook/preview"

import { ConsoleFrameStoryFixture } from "./test-support/console-frame-story-fixture"

const meta = preview.meta({
  title: "Web/Console/Console Frame",
  component: ConsoleFrameStoryFixture,
  tags: ["autodocs"],
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
})
