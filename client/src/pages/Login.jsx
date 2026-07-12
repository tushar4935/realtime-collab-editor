import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Where to go after login: the page that sent us here (e.g. a share link),
  // or the document list by default.
  const from = location.state?.from?.pathname || '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm"
      >
        <h1 className="mb-6 text-xl font-semibold text-gray-800">Log in</h1>
        {error && (
          <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-6 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? 'Logging in…' : 'Log in'}
        </button>
        <p className="mt-4 text-center text-sm text-gray-600">
          No account?{' '}
          <Link to="/register" state={location.state} className="text-blue-600 hover:underline">
            Register
          </Link>
        </p>
      </form>
    </div>
  )
}
