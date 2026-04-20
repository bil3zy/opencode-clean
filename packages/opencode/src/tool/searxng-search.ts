import z from "zod"
import { Effect } from "effect"
import { HttpClient } from "effect/unstable/http"
import { Tool } from "./tool"

const Parameters = z.object({
  query: z.string().describe("Search query"),
  url: z.string().optional().describe("SearXNG instance URL (default: public instance)"),
  language: z.string().optional().describe("Language code (default: en)"),
  maxResults: z.number().optional().describe("Max results to return (default: 10)"),
  timeRange: z.enum(["day", "week", "month", "year"]).optional().describe("Time range filter"),
  categories: z.array(z.string()).optional().describe("Search categories"),
  safeSearch: z.number().optional().describe("Safe search level: 0=off, 1=moderate, 2=strict"),
})

interface SearXNGResult {
  title: string
  url: string
  img_src?: string
  thumbnail_src?: string
  base_url?: string
  content?: string
  engine: string
  engine_data?: Record<string, unknown>
}

interface SearXNGResponse {
  results: SearXNGResult[]
  number_of_results?: number
  query?: string
}

export const SearXNGSearchTool = Tool.define(
  "searxng_search",
  // @ts-expect-error - browser tool metadata types need update
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient

    return {
      description: "Search the web using SearXNG, a privacy-respecting metasearch engine. Returns results from multiple search engines.",
      parameters: Parameters,
      execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "searxng_search",
            patterns: [params.query],
            always: ["*"],
            metadata: { query: params.query },
          })

          const baseUrl = params.url || "https://searx.privacytech.de"
          const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(params.query)}&format=json&engines=google,duckduckgo,bing`

          const response = yield* Effect.promise(() =>
            fetch(searchUrl, {
              headers: { "Accept": "application/json" },
            }),
          )

          if (!response.ok) {
            return {
              output: `SearXNG search failed: ${response.status} ${response.statusText}`,
              title: `Search: ${params.query}`,
              metadata: { error: true },
            }
          }

          const data: SearXNGResponse = yield* Effect.promise(() => response.json() as Promise<SearXNGResponse>)

          const maxResults = params.maxResults ?? 10
          const results = (data.results || []).slice(0, maxResults)

          const formatted = results.map((r, i) =>
            `${i + 1}. ${r.title}\n   URL: ${r.url}${r.content ? `\n   ${r.content.substring(0, 200)}...` : ""}`,
          ).join("\n\n")

          return {
            output: formatted || "No results found",
            title: `SearXNG: ${params.query}`,
            metadata: {
              query: params.query,
              resultCount: results.length,
              engines: [...new Set(results.map((r) => r.engine))].join(", "),
            },
          }
        }),
    }
  }),
)