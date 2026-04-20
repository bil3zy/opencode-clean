import z from "zod"
import { Effect } from "effect"
import { Tool } from "./tool"
import { BrowserPool } from "./browser-pool"

const Parameters = z.object({
  query: z.string().describe("Research query"),
  deep: z.boolean().optional().describe("Use deep research mode (more thorough)"),
  verify: z.boolean().optional().describe("Verify sources with browser snapshot (default: true)"),
  extractData: z.boolean().optional().describe("Extract structured data from results (default: false)"),
  maxResults: z.number().optional().describe("Max search results to consider (default: 5)"),
  searchTool: z.enum(["searxng_search", "websearch"]).optional().describe("Search tool to use (default: searxng_search)"),
})

interface SearchResult {
  url: string
  title: string
  snippet: string
  verified: boolean
  snapshot?: string
}

export const ResearchWebsearchTool = Tool.define(
  "research_websearch",
  // @ts-expect-error - browser tool metadata types need update
  Effect.gen(function* () {
    const pool = yield* BrowserPool.Service

    return {
      description: "Combined search and browser tool for deep research. Performs web search, optionally verifies sources with browser, and returns structured research results.",
      parameters: Parameters,
      execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "research_websearch",
            patterns: [params.query],
            always: ["*"],
            metadata: { query: params.query, deep: params.deep },
          })

          const sessionID = ctx.sessionID
          const maxResults = params.maxResults ?? 5
          const results: SearchResult[] = []

          const context = yield* pool.createContext(sessionID)
          const page = yield* Effect.promise(() => context.newPage())

          const baseUrl = "https://searx.privacytech.de"
          const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(params.query)}&format=json&engines=google,duckduckgo,bing`

          const response = yield* Effect.promise(() => fetch(searchUrl, { headers: { "Accept": "application/json" } }))

          if (!response.ok) {
            return {
              output: `Search failed: ${response.status}`,
              title: `Research: ${params.query}`,
              metadata: { error: true },
            }
          }

          interface SearXNGResponse {
            results: Array<{ title: string; url: string; content?: string; engine: string }>
          }

          const data: SearXNGResponse = yield* Effect.promise(() => response.json() as Promise<SearXNGResponse>)
          const searchResults = (data.results || []).slice(0, maxResults)

          for (const result of searchResults) {
            const searchResult: SearchResult = {
              url: result.url,
              title: result.title,
              snippet: result.content?.substring(0, 200) || "",
              verified: false,
            }

            if (params.verify !== false) {
              try {
                yield* Effect.promise(() => page.goto(result.url, { waitUntil: "domcontentloaded", timeout: 10000 }))
                // @ts-expect-error accessibility API varies by playwright version
                const accessibility = yield* Effect.promise(() => page.accessibility.snapshot())
                searchResult.verified = true
                searchResult.snapshot = JSON.stringify(accessibility, null, 2).substring(0, 1000)
              } catch {
                // Page load failed, mark as not verified
              }
            }

            results.push(searchResult)
          }

          const verifiedCount = results.filter((r) => r.verified).length
          const formatted = results.map((r, i) =>
            `${i + 1}. ${r.title}\n   URL: ${r.url}\n   Verified: ${r.verified ? "Yes" : "No"}\n   ${r.snippet}`,
          ).join("\n\n")

          return {
            output: `Research results for: ${params.query}\n\n${formatted}\n\nVerified: ${verifiedCount}/${results.length}`,
            title: `Research: ${params.query}`,
            metadata: {
              query: params.query,
              resultCount: results.length,
              verifiedCount,
              deep: params.deep,
            },
          }
        }),
    }
  }),
)