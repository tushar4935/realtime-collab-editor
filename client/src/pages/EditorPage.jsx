import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Editor from '../components/Editor'
import AppHeader from '../components/AppHeader'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const STATUS_STYLES = {
  connected: 'bg-green-100 text-green-700',
  connecting: 'bg-amber-100 text-amber-700',
  disconnected: 'bg-red-100 text-red-700',
}

export default function EditorPage() {
  const { id } = useParams()
  const { token, user } = useAuth()
  const [doc, setDoc] = useState(null)
  const [error, setError] = useState('')
  const [connStatus, setConnStatus] = useState('connecting')
  // Everyone connected to this document's room right now (from Yjs
  // awareness), including this tab. One entry per connection.
  const [editors, setEditors] = useState([])
  const [copied, setCopied] = useState(false)

  async function copyShareLink() {
    // The share link carries the unguessable shareId, not the document id.
    // Anyone who opens it must still log in (the /share route is protected),
    // then becomes a collaborator on this document.
    const link = `${window.location.origin}/share/${doc.shareId}`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be blocked (e.g. non-HTTPS); fall back to showing
      // the link so it can be copied by hand.
      window.prompt('Copy this share link:', link)
    }
  }

  useEffect(() => {
    setDoc(null)
    setError('')
    api(`/api/documents/${id}`, { token })
      .then((data) => setDoc(data.document))
      .catch((err) => setError(err.message))
  }, [id, token])

  return (
    <div className="min-h-screen bg-gray-100">
      <AppHeader>
        {doc && <span className="truncate text-sm text-gray-500">/ {doc.title}</span>}
        {doc && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[connStatus] || STATUS_STYLES.connecting}`}
          >
            {connStatus === 'connected'
              ? 'Connected'
              : connStatus === 'connecting'
                ? 'Connecting…'
                : 'Offline'}
          </span>
        )}
        {doc && editors.length > 0 && (
          <span data-testid="presence" className="flex items-center gap-2 text-xs text-gray-600">
            {editors.map((e) => (
              <span key={e.clientId} className="flex items-center gap-1">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: e.color }}
                />
                {e.name}
                {e.isMe && <span className="text-gray-400">(you)</span>}
              </span>
            ))}
          </span>
        )}
        {doc && (
          <button
            type="button"
            onClick={copyShareLink}
            data-testid="share"
            className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            {copied ? 'Link copied' : 'Share'}
          </button>
        )}
      </AppHeader>
      <main className="mx-auto max-w-3xl px-4 py-8">
        {error ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
            <p className="mb-4 text-gray-700">{error}</p>
            <Link to="/" className="text-sm text-blue-600 hover:underline">
              Back to your documents
            </Link>
          </div>
        ) : doc === null ? (
          <p className="text-gray-500">Loading…</p>
        ) : (
          <div className="min-h-[60vh] rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
            <Editor
              docId={id}
              token={token}
              user={user}
              onStatusChange={setConnStatus}
              onPresenceChange={setEditors}
            />
          </div>
        )}
      </main>
    </div>
  )
}
