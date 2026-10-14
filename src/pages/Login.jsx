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
  const [role, setRole] = useState('operator')
  const [phone, setPhone] = useState('')
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

  const quickFillRole = async (selectedRole) => {
    setRole(selectedRole)
    const demoAccounts = {
      operator: { email: 'operator.vikram@clinic.org', name: 'Vikram (Clinic Operator)', phone: '9876543210' },
      doctor: { email: 'dr.sharma@hospital.org', name: 'Dr. Ananya Sharma (Ophthalmologist)', phone: '9811223344' },
      patient: { email: 'patient.ramesh@gmail.com', name: 'Ramesh Kumar (Patient)', phone: '9988776655' },
      admin: { email: 'admin.retina@health.gov', name: 'Dr. Director Admin', phone: '9000000001' }
    }
    const acc = demoAccounts[selectedRole]
    setEmail(acc.email)
    setPassword('password123')
    setConfirmPassword('password123')
    setFullName(acc.name)
    setPhone(acc.phone)
    setNotice(`Demo credentials loaded for role: ${selectedRole.toUpperCase()}. Click Sign In or Create Account.`)
  }

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
        await signup(email, password, fullName, role, phone)
        navigate(from, { replace: true })
      } else {
        await login(email, password)
        navigate(from, { replace: true })
      }
    } catch (err) {
      if (err.needsSignup) {
        setNotice('No account found for this email. Switched to Sign Up with role.')
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
      <div style={{ marginBottom: '1.25rem' }}>
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
            ? 'Select your role and enter your information below (synced with Supabase)'
            : 'Enter your email address and password to continue'}
        </p>
      </div>

      {/* Demo Role Quick-Fill Buttons for Evaluators */}
      <div style={{ marginBottom: '1.5rem', background: '#f8fafc', padding: '0.85rem', borderRadius: 8, border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: '0.76rem', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
          ⚡ 1-Click Demo Profiles (Supabase Synced):
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => quickFillRole('operator')}
            style={{
              padding: '0.45rem 0.6rem',
              fontSize: '0.78rem',
              fontWeight: 600,
              background: role === 'operator' ? '#0d7a63' : '#ffffff',
              color: role === 'operator' ? '#ffffff' : '#0d7a63',
              border: '1px solid #0d7a63',
              borderRadius: 5,
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.15s ease'
            }}
          >
            📸 Operator (Upload)
          </button>
          <button
            type="button"
            onClick={() => quickFillRole('doctor')}
            style={{
              padding: '0.45rem 0.6rem',
              fontSize: '0.78rem',
              fontWeight: 600,
              background: role === 'doctor' ? '#0284c7' : '#ffffff',
              color: role === 'doctor' ? '#ffffff' : '#0284c7',
              border: '1px solid #0284c7',
              borderRadius: 5,
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.15s ease'
            }}
          >
            🩺 Doctor (Review)
          </button>
          <button
            type="button"
            onClick={() => quickFillRole('patient')}
            style={{
              padding: '0.45rem 0.6rem',
              fontSize: '0.78rem',
              fontWeight: 600,
              background: role === 'patient' ? '#8b5cf6' : '#ffffff',
              color: role === 'patient' ? '#ffffff' : '#8b5cf6',
              border: '1px solid #8b5cf6',
              borderRadius: 5,
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.15s ease'
            }}
          >
            👤 Patient (Reports)
          </button>
          <button
            type="button"
            onClick={() => quickFillRole('admin')}
            style={{
              padding: '0.45rem 0.6rem',
              fontSize: '0.78rem',
              fontWeight: 600,
              background: role === 'admin' ? '#475569' : '#ffffff',
              color: role === 'admin' ? '#ffffff' : '#475569',
              border: '1px solid #475569',
              borderRadius: 5,
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.15s ease'
            }}
          >
            🛡️ Admin (System)
          </button>
        </div>
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
          <>
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
                Select Account Role (Supabase Roles)
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.62rem 0.85rem',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontFamily: 'inherit',
                  fontSize: '0.88rem',
                  color: '#0f172a',
                  boxSizing: 'border-box',
                  background: '#ffffff',
                  outline: 'none'
                }}
              >
                <option value="operator">Operator (Field Health Worker / Image Capture Station)</option>
                <option value="doctor">Doctor (Ophthalmologist / Diagnostic Specialist)</option>
                <option value="patient">Patient (Individual Retinal Reports)</option>
                <option value="admin">Admin (System &amp; Database Administration)</option>
              </select>
              <div style={{ marginTop: '0.3rem', fontSize: '0.74rem', color: '#64748b' }}>
                {role === 'operator' && '✓ Operators have specialized patient intake, multi-image upload, and automatic quality rejection.'}
                {role === 'doctor' && '✓ Doctors have diagnostic grading validation, quadrant summaries, and referral actions.'}
                {role === 'patient' && '✓ Patients access personal screening status and retinal health reports.'}
                {role === 'admin' && '✓ Admins manage system accounts, Supabase synchronization, and capacity models.'}
              </div>
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
                Full name
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Vikram Kumar"
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
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9876543210"
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
          </>
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
