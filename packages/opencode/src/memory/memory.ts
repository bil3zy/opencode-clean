import z from "zod"
import { eq, desc, Database } from "../storage/db"
import { Log } from "../util/log"
import { makeRuntime } from "@/effect/run-service"
import { fn } from "@/util/fn"
import { ProjectID } from "../project/schema"
import { SessionID } from "../session/schema"
import { ProjectMemoryTable, CompactionIndexTable } from "./memory.sql"
import { Effect, Layer, Context } from "effect"

const log = Log.create({ service: "memory" })

export namespace Memory {
  const MemoryID = z.string().brand<"MemoryID">()
  type MemoryID = z.infer<typeof MemoryID>

  export const Info = z.object({
    id: z.string(),
    projectID: ProjectID.zod,
    content: z.string(),
    tags: z.array(z.string()),
    sourceSessionID: SessionID.zod.optional(),
    createdAt: z.number(),
    accessedAt: z.number(),
  })
  export type Info = z.infer<typeof Info>

  function fromRow(row: (typeof ProjectMemoryTable.$inferSelect)): Info {
    return {
      id: row.id,
      projectID: row.project_id,
      content: row.content,
      tags: row.tags,
      sourceSessionID: row.source_session_id ?? undefined,
      createdAt: row.time_created,
      accessedAt: row.accessed_at,
    }
  }

  export interface Interface {
    readonly add: (input: Omit<Info, "id" | "createdAt" | "accessedAt">) => Effect.Effect<Info>
    readonly query: (input: { projectID: ProjectID; query: string; limit?: number }) => Effect.Effect<Info[]>
    readonly list: (input: { projectID: ProjectID; limit?: number }) => Effect.Effect<Info[]>
    readonly remove: (id: string) => Effect.Effect<void>
    readonly updateAccessed: (id: string) => Effect.Effect<void>
    readonly searchSessions: (
      input: { sessionID: SessionID; query: string; limit?: number },
    ) => Effect.Effect<Array<{ content: string; tokens: number; score: number }>>
    readonly indexCompaction: (input: { sessionID: SessionID; content: string; tokens: number }) => Effect.Effect<void>
  }

  export class Service extends Context.Service<Service, Interface>()("@opencode/Memory") {}

  const db = <T>(fn: (d: Parameters<typeof Database.use>[0] extends (trx: infer D) => any ? D : never) => T) =>
    Effect.sync(() => Database.use(fn))

  export const layer: Layer.Layer<Service, never> = Layer.effect(
    Service,
    Effect.gen(function* () {
      const add = Effect.fn("Memory.add")(function* (input: Omit<Info, "id" | "createdAt" | "accessedAt">) {
        const id = MemoryID.parse(crypto.randomUUID())
        const now = Date.now()
        yield* db((d) =>
          d
            .insert(ProjectMemoryTable)
            .values({
              id,
              project_id: input.projectID,
              content: input.content,
              tags: input.tags,
              source_session_id: input.sourceSessionID ?? null,
              time_created: now,
              time_updated: now,
              accessed_at: now,
            })
            .run(),
        )
        log.info("added memory", { id, projectID: input.projectID })
        return { id, ...input, createdAt: now, accessedAt: now } as Info
      })

      const updateAccessed = Effect.fn("Memory.updateAccessed")(function* (id: string) {
        yield* db((d) =>
          d
            .update(ProjectMemoryTable)
            .set({ accessed_at: Date.now(), time_updated: Date.now() })
            .where(eq(ProjectMemoryTable.id, id))
            .run(),
        )
      })

      const list = Effect.fn("Memory.list")(function* (input: { projectID: ProjectID; limit?: number }) {
        const rows = yield* db((d) =>
          d
            .select()
            .from(ProjectMemoryTable)
            .where(eq(ProjectMemoryTable.project_id, input.projectID))
            .orderBy(desc(ProjectMemoryTable.accessed_at))
            .limit(input.limit ?? 100)
            .all(),
        )
        return rows.map(fromRow)
      })

      const query = Effect.fn("Memory.query")(function* (input: { projectID: ProjectID; query: string; limit?: number }) {
        const rows = yield* db((d) =>
          d
            .select()
            .from(ProjectMemoryTable)
            .where(eq(ProjectMemoryTable.project_id, input.projectID))
            .all(),
        )
        if (rows.length === 0) return []

        const queryTerms = input.query
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length > 1)
        if (queryTerms.length === 0) return rows.slice(0, input.limit ?? 10).map(fromRow)

        const scored = rows
          .map((row) => {
            const content = row.content.toLowerCase()
            const score = queryTerms.filter((term) => content.includes(term)).length
            return { row, score }
          })
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, input.limit ?? 10)
          .map((s) => fromRow(s.row))

        for (const mem of scored) {
          yield* updateAccessed(mem.id)
        }

        return scored
      })

      const remove = Effect.fn("Memory.remove")(function* (id: string) {
        yield* db((d) => d.delete(ProjectMemoryTable).where(eq(ProjectMemoryTable.id, id)).run())
        log.info("removed memory", { id })
      })

      const searchSessions = Effect.fn("Memory.searchSessions")(function* (input: {
        sessionID: SessionID
        query: string
        limit?: number
      }) {
        const rows = yield* db((d) =>
          d
            .select()
            .from(CompactionIndexTable)
            .where(eq(CompactionIndexTable.session_id, input.sessionID))
            .all(),
        )
        if (rows.length === 0) return []

        const queryTerms = input.query
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length > 1)

        return rows
          .filter((row) => queryTerms.some((term) => row.content.toLowerCase().includes(term)))
          .map((row) => ({
            content: row.content,
            tokens: row.tokens,
            score: queryTerms.filter((term) => row.content.toLowerCase().includes(term)).length,
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, input.limit ?? 5)
      })

      const indexCompaction = Effect.fn("Memory.indexCompaction")(function* (input: {
        sessionID: SessionID
        content: string
        tokens: number
      }) {
        const id = crypto.randomUUID()
        yield* db((d) =>
          d
            .insert(CompactionIndexTable)
            .values({
              id,
              session_id: input.sessionID,
              content: input.content,
              tokens: input.tokens,
              indexed_at: Date.now(),
            })
            .run(),
        )
      })

      return Service.of({ add, query, list, remove, updateAccessed, searchSessions, indexCompaction })
    }),
  )

  export const defaultLayer = layer

  const { runPromise } = makeRuntime(Service, defaultLayer)

  export const add = fn(
    Info.omit({ id: true, createdAt: true, accessedAt: true }),
    (input) => runPromise((svc) => svc.add(input)),
  )

  export const query = fn(
    z.object({ projectID: ProjectID.zod, query: z.string(), limit: z.number().optional() }),
    (input) => runPromise((svc) => svc.query(input)),
  )

  export const list = fn(
    z.object({ projectID: ProjectID.zod, limit: z.number().optional() }),
    (input) => runPromise((svc) => svc.list(input)),
  )

  export const remove = fn(z.string(), (id) => runPromise((svc) => svc.remove(id)))

  export const updateAccessed = fn(z.string(), (id) => runPromise((svc) => svc.updateAccessed(id)))

  export const searchSessions = fn(
    z.object({ sessionID: SessionID.zod, query: z.string(), limit: z.number().optional() }),
    (input) => runPromise((svc) => svc.searchSessions(input)),
  )

  export const indexCompaction = fn(
    z.object({ sessionID: SessionID.zod, content: z.string(), tokens: z.number() }),
    (input) => runPromise((svc) => svc.indexCompaction(input)),
  )
}