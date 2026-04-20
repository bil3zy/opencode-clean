import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { ProjectTable } from "../project/project.sql"
import { SessionTable } from "../session/session.sql"
import { Timestamps } from "../storage/schema.sql"
import type { ProjectID } from "../project/schema"
import type { SessionID } from "../session/schema"

export const ProjectMemoryTable = sqliteTable(
  "project_memory",
  {
    id: text().primaryKey(),
    project_id: text()
      .$type<ProjectID>()
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    content: text().notNull(),
    tags: text({ mode: "json" }).$type<string[]>().notNull(),
    source_session_id: text().$type<SessionID>(),
    ...Timestamps,
    accessed_at: integer().notNull(),
  },
  (table) => [
    index("memory_project_idx").on(table.project_id),
    index("memory_session_idx").on(table.source_session_id),
  ],
)

export const CompactionIndexTable = sqliteTable(
  "compaction_index",
  {
    id: text().primaryKey(),
    session_id: text()
      .$type<SessionID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    content: text().notNull(),
    tokens: integer().notNull(),
    indexed_at: integer().notNull(),
  },
  (table) => [index("compaction_session_idx").on(table.session_id)],
)