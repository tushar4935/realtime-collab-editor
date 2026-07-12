import { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [user, setUser] = useState(null)
  // Start in "loading" only if there is a saved token to check.
  const [loading, setLoading] = useState(() => !!localStorage.getItem('token'))

  // On first load, if a token was saved from a previous visit, ask the server
  // who we are. If the token is expired/invalid, drop it.
  useEffect(() => {
    const saved = localStorage.getItem('token')
    if (!saved) return
    api('/api/auth/me', { token: saved })
      .then((data) => setUser(data.user))
      .catch(() => {
        localStorage.removeItem('token')
        setToken(null)
      })
      .finally(() => setLoading(false))
  }, [])

  function saveSession(data) {
    localStorage.setItem('token', data.token)
    setToken(data.token)
    setUser(data.user)
  }

  async function register(name, email, password) {
    saveSession(await api('/api/auth/register', { method: 'POST', body: { name, email, password } }))
  }

  async function login(email, password) {
    saveSession(await api('/api/auth/login', { method: 'POST', body: { email, password } }))
  }

  function logout() {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
