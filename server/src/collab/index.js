import { WebSocketServer } from 'ws'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import Document from '../models/Document.js'
import { setupWSConnection } from 'y-websocket/bin/utils'
import setupPersistence from './persistence.js'

// The Yjs sync side of the server. The same Node process serves two roles:
// Express handles the /api REST routes, and this module handles websocket
// upgrades on /collab/<docId>. y-websocket keeps one shared Y.Doc per docId
// ("room") in memory and relays each client's incremental updates to the other
// clients in that room. The merging itself happens inside Yjs.

// A websocket starts as an HTTP request asking to "upgrade". Rejecting here,
// before the upgrade completes, is how auth works: no valid token and access,
// no socket.
function reject(socket, code, message) {
  socket.write(`HTTP/1.1 ${code} ${message}\r\nConnection: close\r\n\r\n`)
  socket.destroy()
}

export default function setupCollabServer(httpServer) {
  // Register how rooms load/save their Yjs state in MongoDB. Must happen
  // before any room is created (i.e. before the first upgrade), so do it here
  // at startup rather than per-connection.
  setupPersistence()

  const wss = new WebSocketServer({ noServer: true })

  httpServer.on('upgrade', async (req, socket, head) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`)
      if (!url.pathname.startsWith('/collab/')) {
        return reject(socket, 404, 'Not Found')
      }
      const docId = url.pathname.slice('/collab/'.length)

      // Browsers cannot set an Authorization header on a websocket, so the
      // client sends its JWT as a query parameter instead.
      let userId
      try {
        const payload = jwt.verify(url.searchParams.get('token'), process.env.JWT_SECRET)
        userId = payload.userId
      } catch {
        return reject(socket, 401, 'Unauthorized')
      }

      // Same access rule as the REST routes: the owner OR a user who has
      // joined via the share link (sharedWith). Unknown ids look identical to
      // forbidden ones, so a rejected upgrade never reveals which docs exist.
      if (!mongoose.isValidObjectId(docId)) {
        return reject(socket, 404, 'Not Found')
      }
      const doc = await Document.findOne({
        _id: docId,
        $or: [{ ownerId: userId }, { sharedWith: userId }],
      }).select('_id')
      if (!doc) {
        return reject(socket, 404, 'Not Found')
      }

      wss.handleUpgrade(req, socket, head, (conn) => {
        setupWSConnection(conn, req, { docName: docId })
      })
    } catch (err) {
      console.error('collab upgrade error:', err)
      reject(socket, 500, 'Internal Server Error')
    }
  })
}
