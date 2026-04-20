import { Database, eq } from "../storage/db"
import { SyncEvent } from "../sync"
import { Session } from "../session"
import { ProjectMemoryTable } from "./memory.sql"
import { Log } from "../util/log"

const log = Log.create({ service: "memory.projector" })

export default [
  SyncEvent.project(Session.Event.Deleted, (db, data) => {
    log.info("session deleted, memory extraction not yet implemented", {
      sessionID: data.sessionID,
    })
  }),
]