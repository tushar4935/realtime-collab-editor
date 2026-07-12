// Creates a sample user and document so the app can be tested immediately.
// Run with: npm run seed   (safe to run twice; it skips what already exists)
import 'dotenv/config'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import User from './models/User.js'
import Document from './models/Document.js'

const EMAIL = 'demo@example.com'
const PASSWORD = 'password123'

if (!process.env.MONGODB_URI) {
  console.error('Missing MONGODB_URI. Set up server/.env first (see .env.example).')
  process.exit(1)
}

await mongoose.connect(process.env.MONGODB_URI)

let user = await User.findOne({ email: EMAIL })
if (user) {
  console.log(`User ${EMAIL} already exists, skipping`)
} else {
  user = await User.create({
    name: 'Demo User',
    email: EMAIL,
    passwordHash: await bcrypt.hash(PASSWORD, 10),
  })
  console.log(`Created user ${EMAIL}`)
}

const doc = await Document.findOne({ ownerId: user._id })
if (doc) {
  console.log(`User already has a document ("${doc.title}"), skipping`)
} else {
  const created = await Document.create({ title: 'Welcome document', ownerId: user._id })
  console.log(`Created document "${created.title}"`)
}

console.log(`\nSeed done. Log in with ${EMAIL} / ${PASSWORD}`)
await mongoose.disconnect()
