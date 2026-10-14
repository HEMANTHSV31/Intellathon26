import { useState, useEffect } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [searchParams] = useSearchParams()
  const modeParam = searchParams.get('mode')
  const [activeTab, setActiveTab] = useState(modeParam === 'staff' ? 'staff' : 'patient')

  // Patient Login State (Single text field)
  const [patientInput, setPatientInput] = useState('')
  const [patientSubmitting, setPatientSubmitting] = useState(false)
  const [patientError, setPatientError] = useState('')

  // Staff Login State
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('operator')
  const [phone, setPhone] = useState('')
  const [staffError, setStaffError] = useState('')
  const [staffNotice, setStaffNotice] = useState('')
  const [staffSubmitting, setStaffSubmitting] = useState(false)

  const { login, signup, patientLogin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/screening'

  useEffect(() => {
    if (modeParam === 'staff') {
      setActiveTab('staff')
    } else if (modeParam === 'patient') {
      setActiveTab('patient')
    }
  }, [modeParam])

  // Handle Patient Login (Single text field: Name + Phone)
  const handlePatientSubmit = async (e) => {
    e.preventDefault()
    setPatientError('')

    const trimmed = patientInput.trim().toLowerCase()
    if (!trimmed) {
      setPatientError('Please enter your full name and phone number.')
      return
    }

    setPatientSubmitting(true)
    try {
      // Direct lowercase lookup
      await patientLogin(trimmed)
      navigate('/screening', { replace: true })
    } catch (err) {
      setPatientError(err.message || 'No patient record found matching that name and phone number in Supabase.')
    } finally {
      setPatientSubmitting(false)
    }
  }

  // Handle Staff Login
  const handleStaffSubmit = async (e) => {
    e.preventDefault()
    setStaffError('')
    setStaffNotice('')

    if (!email || !password) {
      setStaffError('Please enter both email and password.')
      return
    }

    if (isSignUp) {
      if (password.length < 6) {
        setStaffError('Password must be at least 6 characters.')
        return
      }
      if (password !== confirmPassword) {
        setStaffError('Passwords do not match.')
        return
      }
    }

    setStaffSubmitting(true)
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
        setStaffNotice('No staff account found for this email. Switched to registration.')
        setIsSignUp(true)
      } else {
        setStaffError(err.message || 'Authentication failed. Please verify your credentials.')
      }
    } finally {
      setStaffSubmitting(false)
    }
  }

  const fillStaffDemo = (selectedRole) => {
    setRole(selectedRole)
    const demoAccounts = {
      operator: { email: 'operator.vikram@clinic.org', name: 'Vikram', phone: '9876543210' },
      doctor: { email: 'dr.sharma@hospital.org', name: 'Dr. Ananya Sharma', phone: '9811223344' },
      admin: { email: 'admin.retina@health.gov', name: 'Clinical Administrator', phone: '9000000001' }
    }
    const acc = demoAccounts[selectedRole]
    setEmail(acc.email)
    setPassword('password123')
    setConfirmPassword('password123')
    setFullName(acc.name)
    setPhone(acc.phone)
    setStaffNotice(`Loaded demo profile: ${selectedRole.toUpperCase()}`)
  }

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 520,
        background: '#ffffff',
        borderRadius: 8,
        padding: '2rem 2.25rem',
        boxSizing: 'border-box',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.05)'
      }}
    >
      {/* Top Tab Bar: Patient Access vs Clinical Staff */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: '1.75rem' }}>
        <button
          type="button"
          onClick={() => { setActiveTab('patient'); setPatientError(''); }}
          style={{
            flex: 1,
            padding: '0.65rem 0.5rem',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'patient' ? '2.5px solid #0f766e' : '2.5px solid transparent',
            color: activeTab === 'patient' ? '#0f766e' : '#64748b',
            fontWeight: activeTab === 'patient' ? 600 : 500,
            fontSize: '0.88rem',
            cursor: 'pointer',
            borderRadius: 0,
            transition: 'color 0.15s ease'
          }}
        >
          Patient Access
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('staff'); setStaffError(''); setStaffNotice(''); }}
          style={{
            flex: 1,
            padding: '0.65rem 0.5rem',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'staff' ? '2.5px solid #0f172a' : '2.5px solid transparent',
            color: activeTab === 'staff' ? '#0f172a' : '#64748b',
            fontWeight: activeTab === 'staff' ? 600 : 500,
            fontSize: '0.88rem',
            cursor: 'pointer',
            borderRadius: 0,
            transition: 'color 0.15s ease'
          }}
        >
          Clinical Staff Sign In
        </button>
      </div>

      {/* ===================================================================== */}
      {/* 1. PATIENT PORTAL ACCESS TAB (Single text field: Name + Phone)       */}
      {/* ===================================================================== */}
      {activeTab === 'patient' && (
        <div>
          <div style={{ marginBottom: '1.25rem' }}>
            <h1 style={{ margin: '0 0 0.35rem 0', fontSize: '1.35rem', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.01em' }}>
              Patient Screening Portal
            </h1>
            <p style={{ margin: 0, fontSize: '0.84rem', color: '#64748b', lineHeight: 1.45 }}>
              Enter your Name and Phone Number to retrieve your fundus screening examination results and referral status.
            </p>
          </div>

          {patientError && (
            <div style={{ padding: '0.65rem 0.95rem', marginBottom: '1.25rem', borderRadius: 4, border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', fontSize: '0.82rem', lineHeight: 1.45 }}>
              {patientError}
            </div>
          )}

          <form onSubmit={handlePatientSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '0.4rem' }}>
                Patient Identifier (Name and Phone Number)
              </label>
              <input
                type="text"
                value={patientInput}
                onChange={(e) => setPatientInput(e.target.value)}
                placeholder="e.g. Ramesh Kumar 9876543210"
                required
                style={{
                  width: '100%',
                  padding: '0.6rem 0.8rem',
                  fontSize: '0.88rem',
                  borderRadius: 5,
                  border: '1px solid #cbd5e1',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block', marginTop: '5px' }}>
                Case-insensitive. Input is automatically normalized to lowercase to search the Supabase patient registry.
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', background: '#f8fafc', padding: '0.6rem 0.8rem', borderRadius: 5, border: '1px solid #e2e8f0', fontSize: '0.76rem', color: '#475569' }}>
              <span>Sample Patient: <code>Ramesh Kumar 9876543210</code></span>
              <button
                type="button"
                onClick={() => setPatientInput('Ramesh Kumar 9876543210')}
                style={{
                  background: 'transparent',
                  border: '1px solid #cbd5e1',
                  borderRadius: 3,
                  padding: '2px 8px',
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  color: '#0f766e'
                }}
              >
                Autofill
              </button>
            </div>

            <button
              type="submit"
              disabled={patientSubmitting}
              style={{
                width: '100%',
                padding: '0.7rem',
                fontSize: '0.88rem',
                fontWeight: 600,
                color: '#ffffff',
                background: '#0f766e',
                border: 'none',
                borderRadius: 5,
                cursor: patientSubmitting ? 'not-allowed' : 'pointer'
              }}
            >
              {patientSubmitting ? 'Verifying Registry…' : 'Access My Screening Record'}
            </button>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 2. CLINICAL STAFF SIGN IN TAB (Operator, Doctor, Admin)              */}
      {/* ===================================================================== */}
      {activeTab === 'staff' && (
        <div>
          <div style={{ marginBottom: '1.25rem' }}>
            <h1 style={{ margin: '0 0 0.35rem 0', fontSize: '1.35rem', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.01em' }}>
              {isSignUp ? 'Staff Registration' : 'Clinical Staff Sign In'}
            </h1>
            <p style={{ margin: 0, fontSize: '0.84rem', color: '#64748b', lineHeight: 1.45 }}>
              Authorized access for clinic operators, ophthalmologists, and system administrators.
            </p>
          </div>

          {/* Quick Demo Selector */}
          <div style={{ marginBottom: '1.25rem', background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: 5, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Demo Profile Selector:
            </div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                type="button"
                onClick={() => fillStaffDemo('operator')}
                style={{
                  flex: 1,
                  padding: '3px 6px',
                  fontSize: '0.74rem',
                  fontWeight: role === 'operator' ? 600 : 400,
                  background: role === 'operator' ? '#0f172a' : '#ffffff',
                  color: role === 'operator' ? '#ffffff' : '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: 3,
                  cursor: 'pointer'
                }}
              >
                Operator
              </button>
              <button
                type="button"
                onClick={() => fillStaffDemo('doctor')}
                style={{
                  flex: 1,
                  padding: '3px 6px',
                  fontSize: '0.74rem',
                  fontWeight: role === 'doctor' ? 600 : 400,
                  background: role === 'doctor' ? '#0f172a' : '#ffffff',
                  color: role === 'doctor' ? '#ffffff' : '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: 3,
                  cursor: 'pointer'
                }}
              >
                Doctor
              </button>
              <button
                type="button"
                onClick={() => fillStaffDemo('admin')}
                style={{
                  flex: 1,
                  padding: '3px 6px',
                  fontSize: '0.74rem',
                  fontWeight: role === 'admin' ? 600 : 400,
                  background: role === 'admin' ? '#0f172a' : '#ffffff',
                  color: role === 'admin' ? '#ffffff' : '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: 3,
                  cursor: 'pointer'
                }}
              >
                Admin
              </button>
            </div>
          </div>

          {staffNotice && (
            <div style={{ padding: '0.55rem 0.85rem', marginBottom: '1rem', borderRadius: 4, border: '1px solid #fed7aa', background: '#fffbeb', color: '#b45309', fontSize: '0.8rem' }}>
              {staffNotice}
            </div>
          )}

          {staffError && (
            <div style={{ padding: '0.55rem 0.85rem', marginBottom: '1rem', borderRadius: 4, border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', fontSize: '0.8rem' }}>
              {staffError}
            </div>
          )}

          <form onSubmit={handleStaffSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {isSignUp && (
              <>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Dr. Ramesh Kumar"
                    style={{ width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.86rem', borderRadius: 4, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                    Staff Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.86rem', borderRadius: 4, border: '1px solid #cbd5e1', boxSizing: 'border-box', background: '#ffffff' }}
                  >
                    <option value="operator">Operator (Fundus Image Intake)</option>
                    <option value="doctor">Doctor / Ophthalmologist (Review &amp; Referral)</option>
                    <option value="admin">Administrator (System Management)</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@clinic.org"
                required
                style={{ width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.86rem', borderRadius: 4, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.86rem', borderRadius: 4, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
              />
            </div>

            {isSignUp && (
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.86rem', borderRadius: 4, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={staffSubmitting}
              style={{
                width: '100%',
                padding: '0.65rem',
                fontSize: '0.86rem',
                fontWeight: 600,
                color: '#ffffff',
                background: '#0f172a',
                border: 'none',
                borderRadius: 4,
                cursor: staffSubmitting ? 'not-allowed' : 'pointer'
              }}
            >
              {staffSubmitting ? 'Authenticating…' : isSignUp ? 'Create Staff Account' : 'Sign In'}
            </button>
          </form>

          <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.8rem', color: '#64748b' }}>
            {isSignUp ? (
              <span>Already registered? <button type="button" onClick={() => setIsSignUp(false)} style={{ background: 'none', border: 'none', color: '#0f172a', fontWeight: 600, cursor: 'pointer', padding: 0 }}>Sign In</button></span>
            ) : (
              <span>New staff member? <button type="button" onClick={() => setIsSignUp(true)} style={{ background: 'none', border: 'none', color: '#0f172a', fontWeight: 600, cursor: 'pointer', padding: 0 }}>Register Here</button></span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
