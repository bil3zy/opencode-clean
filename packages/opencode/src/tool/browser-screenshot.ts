import z from "zod"
import { Effect } from "effect"
import { Tool } from "./tool"
import { BrowserPool } from "./browser-pool"

const Parameters = z.object({
  sessionID: z.string().optional().describe("Session ID for context"),
  fullPage: z.boolean().optional().describe("Capture full page (default: false)"),
})

export const BrowserScreenshotTool = Tool.define(
  "browser_screenshot",
  Effect.gen(function* () {
    const pool = yield* BrowserPool.Service

    return {
      description: "Take a screenshot of the current page. Use only when visual confirmation is needed.",
      parameters: Parameters,
      execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const sessionID = params.sessionID ?? ctx.sessionID
          const context = yield* pool.createContext(sessionID)
          const pages = context.pages()
          const page = pages[pages.length - 1]

          if (!page) {
            return { output: "No active page found", title: "Screenshot failed", metadata: {} }
          }

          const buffer = yield* Effect.promise(() =>
            page.screenshot({ fullPage: params.fullPage ?? false }),
          )

          const base64 = buffer.toString("base64")

          return {
            output: "Screenshot captured",
            title: "Screenshot",
            metadata: {},
            attachments: [{
              type: "file",
              mime: "image/png",
              url: `data:image/png;base64,${base64}`,
            }],
          }
        }),
    }
  }),
)