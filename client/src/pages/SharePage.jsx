import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import AppHeader from '../components/AppHeader'

// Landing page for a share link: /share/:shareId. This route sits behind
// ProtectedRoute, so an anonymous visitor is bounced to /login first and sent
// back here after signing in. Once authenticated we exchange the shareId for
// access (the server adds us to the document's collaborators) and go straight
// into the editor.
export default function SharePage() {
  const { shareId } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api(`/api/documents/join/${shareId}`, { method: 'POST', token })
      .then((data) => {
        if (!cancelled) navigate(`/doc/${data.document.id}`, { replace: true })
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [shareId, token, navigate])

  return (
    <div className="min-h-screen bg-gray-100">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        {error ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
            <p className="mb-4 text-gray-700">{error}</p>
            <Link to="/" className="text-sm text-blue-600 hover:underline">
              Back to your documents
            </Link>
          </div>
        ) : (
          <p className="text-gray-500">Opening shared document…</p>
        )}
      </main>
    </div>
  )
}
