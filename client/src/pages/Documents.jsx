import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import AppHeader from '../components/AppHeader'

export default function Documents() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [docs, setDocs] = useState(null) // null = still loading
  const [error, setError] = useState('')

  useEffect(() => {
    api('/api/documents', { token })
      .then((data) => setDocs(data.documents))
      .catch((err) => setError(err.message))
  }, [token])

  async function createDoc() {
    const title = window.prompt('Document title:', 'Untitled document')
    if (title === null) return // cancelled
    setError('')
    try {
      const data = await api('/api/documents', { method: 'POST', body: { title }, token })
      navigate(`/doc/${data.document.id}`)
    } catch (err) {
      setError(err.message)
    }
  }

  async function deleteDoc(id) {
    if (!window.confirm('Delete this document? This cannot be undone.')) return
    setError('')
    try {
      await api(`/api/documents/${id}`, { method: 'DELETE', token })
      setDocs((current) => current.filter((d) => d.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-800">Your documents</h2>
          <button
            type="button"
            onClick={createDoc}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New document
          </button>
        </div>
        {error && (
          <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        {docs === null ? (
          <p className="text-gray-500">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
            No documents yet. Create your first one.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-sm">
            {docs.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between px-4 py-3">
                <Link
                  to={`/doc/${doc.id}`}
                  className="flex min-w-0 flex-1 items-center gap-2 truncate font-medium text-gray-800 hover:text-blue-600"
                >
                  <span className="truncate">{doc.title}</span>
                  {!doc.isOwner && (
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-500">
                      Shared with you
                    </span>
                  )}
                </Link>
                <div className="ml-4 flex items-center gap-4">
                  <span className="text-xs text-gray-400">
                    {new Date(doc.updatedAt).toLocaleString()}
                  </span>
                  {/* Only the owner can delete; a collaborator just sees the doc. */}
                  {doc.isOwner && (
                    <button
                      type="button"
                      onClick={() => deleteDoc(doc.id)}
                      className="rounded border border-gray-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
