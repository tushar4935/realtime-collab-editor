import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import authRouter from './routes/auth.js'
import documentsRouter from './routes/documents.js'
import setupCollabServer from './collab/index.js'

const app = express()
// CORS applies to the REST API (the /collab websocket authenticates by token,
// not by origin, so it is unaffected). In production set CLIENT_ORIGIN to the
// deployed frontend URL to lock the API to that one origin; left unset (local
// dev) it reflects any origin.
app.use(cors({ origin: process.env.CLIENT_ORIGIN || true }))
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'not connected',
  })
})

app.use('/api/auth', authRouter)
app.use('/api/documents', documentsRouter)

// Express 5 forwards rejected promises from async routes here.
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Server error' })
})

const PORT = process.env.PORT || 4000

async function start() {
  if (!process.env.MONGODB_URI) {
    console.error(
      'Missing MONGODB_URI. Copy server/.env.example to server/.env and fill in your Atlas connection string.'
    )
    process.exit(1)
  }
  if (!process.env.JWT_SECRET) {
    console.error(
      'Missing JWT_SECRET. Add a long random string to server/.env (see .env.example).'
    )
    process.exit(1)
  }
  await mongoose.connect(process.env.MONGODB_URI)
  console.log('MongoDB connected')
  const server = app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`)
    console.log(`Yjs sync listening on ws://localhost:${PORT}/collab/<docId>`)
  })
  setupCollabServer(server)
}

start().catch((err) => {
  console.error('Failed to start server:', err.message)
  process.exit(1)
})
