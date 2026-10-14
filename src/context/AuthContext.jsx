import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('dr_user')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })
  const [token, setToken] = useState(() => localStorage.getItem('dr_token') || null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function verifySession() {
      if (!token) {
        setLoading(false)
        return
      }

      try {
        const res = await fetch('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        })

        if (res.ok) {
          const data = await res.json()
          setUser(data.user)
          localStorage.setItem('dr_user', JSON.stringify(data.user))
        } else {
          // Token expired or invalid
          logout()
        }
      } catch (err) {
        console.warn('Session verification error:', err)
      } finally {
        setLoading(false)
      }
    }

    verifySession()
  }, [token])

  const login = async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })

    const data = await res.json()

    if (!res.ok) {
      const error = new Error(data.error || 'Login failed')
      error.needsSignup = data.needsSignup || false
      error.status = res.status
      throw error
    }

    setToken(data.token)
    setUser(data.user)
    localStorage.setItem('dr_token', data.token)
    localStorage.setItem('dr_user', JSON.stringify(data.user))
    return data
  }

  const signup = async (email, password, fullName) => {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, fullName })
    })

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || 'Signup failed')
    }

    setToken(data.token)
    setUser(data.user)
    localStorage.setItem('dr_token', data.token)
    localStorage.setItem('dr_user', JSON.stringify(data.user))
    return data
  }

  const checkEmail = async (email) => {
    const res = await fetch('/api/auth/check-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    })
    return res.json()
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('dr_token')
    localStorage.removeItem('dr_user')
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated: !!token && !!user,
        login,
        signup,
        checkEmail,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
