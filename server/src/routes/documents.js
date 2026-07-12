import { Router } from 'express'
import mongoose from 'mongoose'
import Document from '../models/Document.js'
import requireAuth from '../middleware/auth.js'

const router = Router()

// Every document route requires a logged-in user.
router.use(requireAuth)

// A document is accessible to a user if they own it or have joined it via its
// share link. Used everywhere access is checked so read/edit stay consistent;
// only delete is stricter (owner only).
function accessibleBy(userId) {
  return { $or: [{ ownerId: userId }, { sharedWith: userId }] }
}

// List/detail responses carry metadata only; yjsState is binary CRDT state and
// can get large, so it never rides along on CRUD responses. `isOwner` lets the
// client show a "shared with me" badge and hide delete for docs the user
// doesn't own.
function toMetadata(doc, userId) {
  return {
    id: doc._id,
    title: doc.title,
    shareId: doc.shareId,
    isOwner: doc.ownerId.equals(userId),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

// A malformed :id (not a valid ObjectId) makes Mongoose throw a CastError,
// which would surface as a 500. To the caller it's just a missing document.
function validId(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: 'Document not found' })
  }
  next()
}

router.post('/', async (req, res) => {
  const title = (req.body?.title || '').trim()
  const doc = await Document.create({
    ...(title ? { title } : {}),
    ownerId: req.userId,
  })
  res.status(201).json({ document: toMetadata(doc, req.userId) })
})

router.get('/', async (req, res) => {
  // Documents I own plus documents shared with me, newest activity first.
  const docs = await Document.find(accessibleBy(req.userId))
    .select('-yjsState')
    .sort({ updatedAt: -1 })
  res.json({ documents: docs.map((d) => toMetadata(d, req.userId)) })
})

// Resolve a share link: given a shareId, add the current user to the
// document's collaborators (unless they own it or already joined) and return
// its metadata so the client can open it. This is the only place a non-owner
// gains access; afterwards they're checked like any collaborator.
router.post('/join/:shareId', async (req, res) => {
  // shareId is an opaque token, not an ObjectId, so look it up directly.
  const doc = await Document.findOne({ shareId: req.params.shareId })
  if (!doc) {
    return res.status(404).json({ error: 'This share link is not valid' })
  }
  const isOwner = doc.ownerId.equals(req.userId)
  const alreadyMember = doc.sharedWith.some((id) => id.equals(req.userId))
  if (!isOwner && !alreadyMember) {
    // $addToSet is idempotent and atomic, so concurrent joins can't duplicate.
    await Document.updateOne({ _id: doc._id }, { $addToSet: { sharedWith: req.userId } })
  }
  res.json({ document: toMetadata(doc, req.userId) })
})

router.get('/:id', validId, async (req, res) => {
  // Owner or collaborator only; anyone else's doc id 404s the same way a
  // nonexistent one does, so there's no way to probe which ids exist.
  const doc = await Document.findOne({
    _id: req.params.id,
    ...accessibleBy(req.userId),
  }).select('-yjsState')
  if (!doc) {
    return res.status(404).json({ error: 'Document not found' })
  }
  res.json({ document: toMetadata(doc, req.userId) })
})

router.delete('/:id', validId, async (req, res) => {
  // Deleting is owner-only; a collaborator can't destroy the doc for everyone.
  const doc = await Document.findOneAndDelete({ _id: req.params.id, ownerId: req.userId })
  if (!doc) {
    return res.status(404).json({ error: 'Document not found' })
  }
  res.json({ ok: true })
})

export default router
