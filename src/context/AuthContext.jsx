import { createContext, useContext, useState, useEffect } from 'react'
import {
  saveOfflineAuthSession,
  getOfflineAuthSession,
  clearOfflineAuthSession,
  cachedFetch,
  cacheApiResponse
} from '../utils/offlineDb'

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
  const [isOffline, setIsOffline] = useState(() => (typeof navigator !== 'undefined' ? !navigator.onLine : false))

  // Track online/offline status in real time
  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    async function verifySession() {
      // Check IndexedDB if local state is missing
      let activeToken = token
      if (!activeToken) {
        const idbSession = await getOfflineAuthSession()
        if (idbSession?.token && idbSession?.user) {
          activeToken = idbSession.token
          setToken(idbSession.token)
          setUser(idbSession.user)
          localStorage.setItem('dr_token', idbSession.token)
          localStorage.setItem('dr_user', JSON.stringify(idbSession.user))
        } else {
          setLoading(false)
          return
        }
      }

      try {
        const res = await cachedFetch('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${activeToken}`
          }
        })

        if (res.ok) {
          const data = await res.json()
          setUser(data.user)
          localStorage.setItem('dr_user', JSON.stringify(data.user))
          await saveOfflineAuthSession(data.user, activeToken)
        } else if (res.status === 401 || res.status === 403) {
          // Token is explicitly invalidated by server
          logout()
        }
      } catch (err) {
        console.warn('Session verification error, checking IndexedDB offline session:', err)
        const idbSession = await getOfflineAuthSession()
        if (idbSession?.user) {
          console.log('[Rural Mode] Restored active session from IndexedDB')
          setUser(idbSession.user)
        }
      } finally {
        setLoading(false)
      }
    }

    verifySession()
  }, [token])

  const login = async (email, password) => {
    try {
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

      // Persist in IndexedDB for rural offline use
      await saveOfflineAuthSession(data.user, data.token)
      await cacheApiResponse('/api/auth/login', { method: 'POST', body: JSON.stringify({ email }) }, data)

      return data
    } catch (err) {
      // Offline fallback: Check if user was previously authenticated in IndexedDB
      if (!navigator.onLine || err.message?.includes('fetch') || err.message?.includes('Failed to fetch')) {
        const idbSession = await getOfflineAuthSession()
        if (idbSession?.user && idbSession.user.email?.toLowerCase() === email.trim().toLowerCase()) {
          console.log('[Rural Mode] Authenticated via IndexedDB cached session')
          setToken(idbSession.token)
          setUser(idbSession.user)
          return { user: idbSession.user, token: idbSession.token, isOffline: true }
        }
      }
      throw err
    }
  }

  const signup = async (email, password, fullName, role = 'operator', phone = '') => {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, fullName, role, phone })
    })

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || 'Signup failed')
    }

    setToken(data.token)
    setUser(data.user)
    localStorage.setItem('dr_token', data.token)
    localStorage.setItem('dr_user', JSON.stringify(data.user))

    await saveOfflineAuthSession(data.user, data.token)
    return data
  }

  const switchRole = (newRole) => {
    if (!user) return
    const updatedUser = { ...user, role: newRole }
    setUser(updatedUser)
    localStorage.setItem('dr_user', JSON.stringify(updatedUser))
    if (token) saveOfflineAuthSession(updatedUser, token).catch(() => {})
  }

  const checkEmail = async (email) => {
    const res = await cachedFetch('/api/auth/check-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    })
    return res.json()
  }

  const patientLogin = async (query) => {
    const cleanQuery = (query || '').trim().toLowerCase()
    const res = await fetch('/api/auth/patient-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: cleanQuery })
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || 'No patient record found in database')
    }

    setToken(data.token)
    setUser(data.user)
    localStorage.setItem('dr_token', data.token)
    localStorage.setItem('dr_user', JSON.stringify(data.user))

    await saveOfflineAuthSession(data.user, data.token)
    return data
  }

  const logout = async () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('dr_token')
    localStorage.removeItem('dr_user')
    await clearOfflineAuthSession()
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || 'operator',
        token,
        loading,
        isAuthenticated: !!token && !!user,
        isOffline,
        login,
        signup,
        patientLogin,
        switchRole,
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
