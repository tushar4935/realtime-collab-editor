import { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:4000/collab'

// Cursor/label colors. Picked deterministically from the user's name so the
// same person gets the same color in every tab and on every visit, without
// storing anything.
const CURSOR_COLORS = [
  '#e8590c', // orange
  '#0ca678', // teal
  '#7048e8', // violet
  '#d6336c', // pink
  '#1971c2', // blue
  '#f08c00', // amber
  '#2f9e44', // green
  '#e03131', // red
]

function colorFor(name) {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)) >>> 0
  return CURSOR_COLORS[hash % CURSOR_COLORS.length]
}

// Collaborative editor. The Y.Doc (not React state, not Tiptap's content) is
// the single source of truth for the document text. Tiptap renders it and
// feeds local keystrokes into it; the WebsocketProvider syncs it with the
// server room named after the document id.
export default function Editor({ docId, token, user, onStatusChange, onPresenceChange }) {
  const [provider, setProvider] = useState(null)

  useEffect(() => {
    const ydoc = new Y.Doc()
    // The JWT rides along as a query param because browsers cannot set
    // headers on a websocket. The server verifies it before upgrading.
    const wsProvider = new WebsocketProvider(WS_URL, docId, ydoc, {
      params: { token },
    })
    wsProvider.on('status', ({ status }) => onStatusChange?.(status))
    setProvider(wsProvider)
    return () => {
      wsProvider.destroy()
      ydoc.destroy()
      setProvider(null)
    }
    // onStatusChange is intentionally left out of the deps: recreating the
    // provider tears down the live connection, so only identity changes
    // (which doc, which user) should trigger that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, token])

  // Presence: awareness is Yjs's side channel for ephemeral state (who is
  // connected, where their cursor is). Unlike the document it is never
  // persisted; close the tab and your entry disappears. Each connection
  // (not each account) is one awareness client, so the same user in two
  // tabs shows up twice: two live cursors, which is correct.
  useEffect(() => {
    if (!provider) return
    const awareness = provider.awareness
    const report = () => {
      const editors = Array.from(awareness.getStates().entries())
        .filter(([, state]) => state.user)
        .map(([clientId, state]) => ({
          clientId,
          name: state.user.name,
          color: state.user.color,
          isMe: clientId === awareness.clientID,
        }))
      onPresenceChange?.(editors)
    }
    awareness.on('change', report)
    report()
    return () => {
      awareness.off('change', report)
      onPresenceChange?.([])
    }
    // onPresenceChange left out of the deps, same reason as onStatusChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider])

  if (!provider) return null
  return <CollabEditor provider={provider} user={user} />
}

function CollabEditor({ provider, user }) {
  const editor = useEditor(
    {
      extensions: [
        // Yjs has its own undo manager that only undoes your own edits, so
        // Tiptap's plain history is turned off; two undo stacks would fight.
        StarterKit.configure({ history: false }),
        Collaboration.configure({ document: provider.doc }),
        // Publishes this client's cursor position + user info through the
        // provider's awareness channel, and renders everyone else's as
        // colored carets (styled in index.css).
        CollaborationCursor.configure({
          provider,
          user: { name: user?.name || 'Anonymous', color: colorFor(user?.name || 'Anonymous') },
        }),
      ],
      // No initial `content`: the shared Y.Doc arrives from the server, and
      // setting content here would re-insert it on every join.
    },
    [provider]
  )

  return <EditorContent editor={editor} />
}
