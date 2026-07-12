import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import requireAuth from '../middleware/auth.js'

const router = Router()

function signToken(user) {
  return jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  })
}

// Shape of the user object sent to the client. Never includes the passwordHash.
function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email }
}

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body || {}
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' })
  }
  const existing = await User.findOne({ email: email.toLowerCase() })
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists' })
  }
  const passwordHash = await bcrypt.hash(password, 10)
  const user = await User.create({ name, email, passwordHash })
  res.status(201).json({ token: signToken(user), user: publicUser(user) })
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }
  const user = await User.findOne({ email: email.toLowerCase() })
  // Same error for "no such user" and "wrong password" so the response
  // doesn't reveal which emails have accounts.
  const ok = user && (await bcrypt.compare(password, user.passwordHash))
  if (!ok) {
    return res.status(401).json({ error: 'Wrong email or password' })
  }
  res.json({ token: signToken(user), user: publicUser(user) })
})

// Lets the client restore a session on page refresh from a saved token.
router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId)
  if (!user) {
    return res.status(401).json({ error: 'User no longer exists' })
  }
  res.json({ user: publicUser(user) })
})

export default router
