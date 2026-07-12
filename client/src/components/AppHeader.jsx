import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Shared top bar: app name (links home), optional page-specific content in the
// middle, user name + logout on the right.
export default function AppHeader({ children }) {
  const { user, logout } = useAuth()

  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center gap-4">
        <Link to="/" className="text-lg font-semibold text-gray-800 hover:text-gray-600">
          Collab Editor
        </Link>
        {children}
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600">{user.name}</span>
        <button
          type="button"
          onClick={logout}
          className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
        >
          Log out
        </button>
      </div>
    </header>
  )
}
