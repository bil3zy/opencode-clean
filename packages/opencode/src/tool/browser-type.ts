import z from "zod"
import { Effect } from "effect"
import { Tool } from "./tool"
import { BrowserPool } from "./browser-pool"

const Parameters = z.object({
  selector: z.string().describe("Selector for the input field"),
  text: z.string().describe("Text to type"),
  sessionID: z.string().optional().describe("Session ID for context"),
  clear: z.boolean().optional().describe("Clear field before typing (default: false)"),
})

export const BrowserTypeTool = Tool.define(
  "browser_type",
  // @ts-expect-error - browser tool metadata types need update
  Effect.gen(function* () {
    const pool = yield* BrowserPool.Service

    return {
      description: "Type text into an input field. Use clear: true to replace existing content.",
      parameters: Parameters,
      execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const sessionID = params.sessionID ?? ctx.sessionID
          const context = yield* pool.createContext(sessionID)
          const pages = context.pages()
          const page = pages[pages.length - 1]

          if (!page) {
            return { output: "No active page found", title: "Type failed", metadata: {} }
          }

          yield* Effect.promise(() =>
            page.waitForSelector(params.selector, { state: "visible" }),
          )

          if (params.clear) {
            yield* Effect.promise(() => page.fill(params.selector, ""))
          }

          yield* Effect.promise(() => page.type(params.selector, params.text))

          return {
            output: `Typed "${params.text}" into ${params.selector}`,
            title: `Type: ${params.selector}`,
            metadata: { selector: params.selector, textLength: params.text.length },
          }
        }),
    }
  }),
)