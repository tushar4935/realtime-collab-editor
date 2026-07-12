import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Wraps a page that requires login. While the saved token is being checked we
// render a placeholder instead of redirecting, so a page refresh doesn't
// bounce a logged-in user to /login.
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return <div className="p-8 text-gray-500">Loading…</div>
  }
  if (!user) {
    // Remember where they were headed so login/register can send them back
    // there. This is what makes a share link work for a logged-out visitor:
    // /share/:id -> /login -> (sign in) -> /share/:id.
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return children
}
