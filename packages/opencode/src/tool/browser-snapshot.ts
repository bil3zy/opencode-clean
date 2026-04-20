import z from "zod"
import { Effect } from "effect"
import { Tool } from "./tool"
import { BrowserPool } from "./browser-pool"

const Parameters = z.object({
  sessionID: z.string().optional().describe("Session ID for context"),
  maxLength: z.number().optional().describe("Max length of accessibility tree (default: 10000)"),
})

export const BrowserSnapshotTool = Tool.define(
  "browser_snapshot",
  // @ts-expect-error - browser tool metadata types need update
  Effect.gen(function* () {
    const pool = yield* BrowserPool.Service

    return {
      description: "Capture the accessibility tree of the current page. This is relatively expensive - reuse the latest snapshot unless the page changed.",
      parameters: Parameters,
      execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const sessionID = params.sessionID ?? ctx.sessionID
          const context = yield* pool.createContext(sessionID)
          const pages = context.pages()
          const page = pages[pages.length - 1]

          if (!page) {
            return { output: "No active page found", title: "Snapshot failed", metadata: {} }
          }

          // @ts-expect-error - accessibility API varies by playwright version
          const accessibility = yield* Effect.promise(() => page.accessibility.snapshot())

          let tree = JSON.stringify(accessibility, null, 2)
          const maxLen = params.maxLength ?? 10000
          if (tree.length > maxLen) {
            tree = tree.substring(0, maxLen) + "...\n[truncated]"
          }

          return {
            output: `Accessibility snapshot:\n${tree}`,
            title: "Page snapshot",
            metadata: { url: page.url() },
          }
        }),
    }
  }),
)