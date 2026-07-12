import crypto from 'node:crypto'
import mongoose from 'mongoose'

const documentSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, default: 'Untitled document' },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Users besides the owner who have opened this document's share link while
    // logged in. Flat list, everyone an equal editor (no per-user roles).
    // Access = owner or in this list. Populated by POST /documents/join/:shareId.
    sharedWith: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
      },
    ],
    // Serialized Yjs CRDT state (binary): the whole document as one update
    // blob. Written by the collab persistence layer (debounced while editing
    // and on last-client disconnect) and re-applied when the room reopens.
    // null until the document has been edited at least once.
    yjsState: { type: Buffer, default: null },
    // Random URL-safe id used for share links. Unlike _id it isn't guessable
    // from other ids, so knowing one link reveals nothing else.
    shareId: {
      type: String,
      unique: true,
      default: () => crypto.randomBytes(8).toString('base64url'),
    },
  },
  { timestamps: true }
)

export default mongoose.model('Document', documentSchema)
