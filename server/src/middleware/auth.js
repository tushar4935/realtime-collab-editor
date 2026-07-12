import jwt from 'jsonwebtoken'

// Reads "Authorization: Bearer <token>", verifies the signature, and puts the
// user's id on req.userId. Any route mounted behind this middleware can trust
// req.userId; requests without a valid token never reach the route.
export default function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
  if (!token) {
    return res.status(401).json({ error: 'Not logged in' })
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.userId = payload.userId
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}
