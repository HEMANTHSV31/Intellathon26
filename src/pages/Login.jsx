import { useState, useEffect } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [searchParams] = useSearchParams()
  const [isSignUp, setIsSignUp] = useState(searchParams.get('mode') === 'signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { login, signup } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/screening'

  useEffect(() => {
    setIsSignUp(searchParams.get('mode') === 'signup')
    setError('')
    setNotice('')
  }, [searchParams])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setNotice('')

    if (!email || !password) {
      setError('Please enter both email and password.')
      return
    }

    if (isSignUp) {
      if (password.length < 6) {
        setError('Password must be at least 6 characters.')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }
    }

    setSubmitting(true)
    try {
      if (isSignUp) {
        await signup(email, password, fullName)
        navigate(from, { replace: true })
      } else {
        await login(email, password)
        navigate(from, { replace: true })
      }
    } catch (err) {
      if (err.needsSignup) {
        setNotice('No account found for this email. Switched to Sign Up.')
        setIsSignUp(true)
      } else {
        setError(err.message || 'Authentication failed. Please check your credentials.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 500,
        background: '#ffffff',
        borderRadius: 10,
        padding: '2.5rem 2.5rem 2.25rem 2.5rem',
        boxSizing: 'border-box',
        border: '1px solid #e2e8f0',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.02)'
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '1.85rem' }}>
        <h1
          style={{
            margin: '0 0 0.45rem 0',
            fontSize: '1.55rem',
            fontWeight: 600,
            color: '#0f172a',
            letterSpacing: '-0.02em'
          }}
        >
          {isSignUp ? 'Create an account' : 'Sign in'}
        </h1>
        <p style={{ margin: 0, fontSize: '0.88rem', color: '#64748b', lineHeight: 1.45 }}>
          {isSignUp
            ? 'Enter your information below to register for screening tools'
            : 'Enter your email address and password to continue'}
        </p>
      </div>

      {notice && (
        <div
          style={{
            marginBottom: '1.25rem',
            border: '1px solid #fef08a',
            background: '#fefce8',
            color: '#854d0e',
            padding: '0.65rem 0.95rem',
            borderRadius: 6,
            fontSize: '0.82rem',
            lineHeight: 1.45
          }}
        >
          {notice}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '0.65rem 0.95rem',
            marginBottom: '1.25rem',
            borderRadius: 6,
            border: '1px solid #fecaca',
            background: '#fef2f2',
            color: '#991b1b',
            fontSize: '0.82rem',
            lineHeight: 1.45
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
        {isSignUp && (
          <div>
            <label
              style={{
                display: 'block',
                marginBottom: '0.4rem',
                fontSize: '0.82rem',
                fontWeight: 500,
                color: '#334155'
              }}
            >
              Full name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Dr. Alex Morgan"
              style={{
                width: '100%',
                padding: '0.62rem 0.85rem',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontFamily: 'inherit',
                fontSize: '0.88rem',
                color: '#0f172a',
                boxSizing: 'border-box',
                outline: 'none',
                background: '#ffffff',
                transition: 'border-color 0.15s ease'
              }}
            />
          </div>
        )}

        <div>
          <label
            style={{
              display: 'block',
              marginBottom: '0.4rem',
              fontSize: '0.82rem',
              fontWeight: 500,
              color: '#334155'
            }}
          >
            Email address
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@hospital.org"
            style={{
              width: '100%',
              padding: '0.62rem 0.85rem',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              fontFamily: 'inherit',
              fontSize: '0.88rem',
              color: '#0f172a',
              boxSizing: 'border-box',
              outline: 'none',
              background: '#ffffff',
              transition: 'border-color 0.15s ease'
            }}
          />
        </div>

        <div>
          <label
            style={{
              display: 'block',
              marginBottom: '0.4rem',
              fontSize: '0.82rem',
              fontWeight: 500,
              color: '#334155'
            }}
          >
            Password
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{
              width: '100%',
              padding: '0.62rem 0.85rem',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              fontFamily: 'inherit',
              fontSize: '0.88rem',
              color: '#0f172a',
              boxSizing: 'border-box',
              outline: 'none',
              background: '#ffffff',
              transition: 'border-color 0.15s ease'
            }}
          />
        </div>

        {isSignUp && (
          <div>
            <label
              style={{
                display: 'block',
                marginBottom: '0.4rem',
                fontSize: '0.82rem',
                fontWeight: 500,
                color: '#334155'
              }}
            >
              Confirm password
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '0.62rem 0.85rem',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontFamily: 'inherit',
                fontSize: '0.88rem',
                color: '#0f172a',
                boxSizing: 'border-box',
                outline: 'none',
                background: '#ffffff',
                transition: 'border-color 0.15s ease'
              }}
            />
          </div>
        )}

        <div style={{ marginTop: '0.6rem' }}>
          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              padding: '0.72rem 1.25rem',
              background: '#0d7a63',
              color: '#ffffff',
              border: '1px solid #0d7a63',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: '0.92rem',
              cursor: submitting ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              boxShadow: '0 1px 2px rgba(13, 122, 99, 0.12)',
              transition: 'background-color 0.15s ease, border-color 0.15s ease'
            }}
            onMouseOver={(e) => {
              if (!submitting) e.currentTarget.style.backgroundColor = '#0a6350'
            }}
            onMouseOut={(e) => {
              if (!submitting) e.currentTarget.style.backgroundColor = '#0d7a63'
            }}
          >
            {submitting
              ? isSignUp
                ? 'Creating account...'
                : 'Signing in...'
              : isSignUp
              ? 'Create account'
              : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  )
}
