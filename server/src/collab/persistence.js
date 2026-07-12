import { createRequire } from 'node:module'
import { setPersistence } from 'y-websocket/bin/utils'
import Document from '../models/Document.js'

// Load Yjs via require() the same way y-websocket does internally, so both use
// a single Yjs instance. Importing it as ESM (import * as Y from 'yjs') pulls
// in the separate ESM build; with two copies loaded, the Y.Doc y-websocket
// hands us fails Y.applyUpdate's instanceof checks ("Yjs was already imported").
const require = createRequire(import.meta.url)
const Y = require('yjs')

// Without persistence a document's Y.Doc lives only in server memory
// (y-websocket's `docs` Map) and is gone on restart or when the last client
// leaves the room. This tells y-websocket how to load a document's saved state
// when its room opens and how to write it back to MongoDB.
//
// The whole document is stored as one binary blob on the document's own row
// (the `yjsState` field) rather than through y-mongodb-provider. The metadata
// (title, owner, shareId) already lives on that row, so keeping one document =
// one row means the ownership check and the stored bytes can't drift apart.
// The encode/apply is just Y.encodeStateAsUpdate / Y.applyUpdate; all this file
// owns is the policy of when to save.

// A Yjs update carries an `origin`. Tagging our own load with this symbol keeps
// the update it fires from looking like a real edit, which would otherwise
// re-save unchanged bytes every time someone opened the document.
const LOAD_ORIGIN = Symbol('persistence-load')

// Per-room save bookkeeping: a pending debounce timer and whether any real
// edit has happened since the last save. Keyed by docName (the document id).
const rooms = new Map()

const SAVE_DEBOUNCE_MS = 2000

async function saveNow(docName, ydoc) {
  const room = rooms.get(docName)
  if (!room) return
  if (room.timer) {
    clearTimeout(room.timer)
    room.timer = null
  }
  if (!room.dirty) return // nothing changed since the last save
  room.dirty = false
  // encodeStateAsUpdate is synchronous, so this snapshot is taken before the
  // await below; any edit arriving during the write flips dirty back on and
  // schedules another save, so nothing is lost.
  const state = Buffer.from(Y.encodeStateAsUpdate(ydoc))
  try {
    await Document.updateOne({ _id: docName }, { $set: { yjsState: state } })
  } catch (err) {
    // A failed debounced save is not fatal: the next edit re-encodes the whole
    // state and tries again. Log it and keep the room alive.
    room.dirty = true
    console.error(`persistence: failed to save ${docName}:`, err.message)
  }
}

function scheduleSave(docName, ydoc) {
  const room = rooms.get(docName)
  if (!room) return
  room.dirty = true
  if (room.timer) clearTimeout(room.timer)
  room.timer = setTimeout(() => saveNow(docName, ydoc), SAVE_DEBOUNCE_MS)
}

export default function setupPersistence() {
  setPersistence({
    provider: null,
    // Called once, when a room's Y.Doc is first created (first client joins).
    bindState: async (docName, ydoc) => {
      rooms.set(docName, { timer: null, dirty: false })

      // Subscribe before the await so an edit racing in while we load from
      // Mongo is still counted. Our own load is tagged with LOAD_ORIGIN and
      // ignored so it isn't treated as an edit.
      ydoc.on('update', (_update, origin) => {
        if (origin === LOAD_ORIGIN) return
        scheduleSave(docName, ydoc)
      })

      const row = await Document.findById(docName).select('yjsState')
      if (row?.yjsState?.length) {
        // Applying the stored blob fires an 'update', which the constructor's
        // broadcast handler relays to any already-connected client. That is why
        // loading works even though y-websocket doesn't await bindState before
        // the sync handshake.
        Y.applyUpdate(ydoc, new Uint8Array(row.yjsState), LOAD_ORIGIN)
      }
    },
    // Called when the last client leaves the room (conns drop to zero), just
    // before y-websocket destroys the in-memory doc. Final flush.
    writeState: async (docName, ydoc) => {
      await saveNow(docName, ydoc)
      rooms.delete(docName)
    },
  })
}
