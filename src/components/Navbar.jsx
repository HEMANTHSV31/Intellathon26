import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LanguageSelector from './LanguageSelector'

export default function Navbar() {
  const { isAuthenticated, user, role, switchRole, logout } = useAuth()
  const activeRole = role || user?.role || 'operator'
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const isSignInActive = location.pathname === '/login' && (!location.search || location.search.includes('staff'))
  const isPatientLoginActive = location.pathname === '/login' && location.search.includes('patient')

  return (
    <nav
      className="site-nav"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        margin: 0,
        padding: 0,
        border: 'none',
        textDecoration: 'none'
      }}
    >
      {/* Brand & Dynamic Nav Links strictly per Role */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.75rem' }}>
        <span
          className="brand"
          style={{
            fontWeight: 700,
            fontSize: '0.9rem',
            letterSpacing: '-0.01em',
            color: '#0f172a',
            cursor: 'default',
            userSelect: 'none',
            textTransform: 'uppercase',
            borderRight: '1px solid #e2e8f0',
            paddingRight: '1.25rem'
          }}
        >
          DR Screening
        </span>

        {/* 1. NOT AUTHENTICATED */}
        {!isAuthenticated && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <NavLink
              to="/"
              end
              className={({ isActive }) => (isActive ? 'active-link' : undefined)}
              style={({ isActive }) => ({
                fontSize: '0.84rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#0f172a' : '#64748b',
                textDecoration: 'none'
              })}
            >
              Overview
            </NavLink>
            <NavLink
              to="/reference"
              className={({ isActive }) => (isActive ? 'active-link' : undefined)}
              style={({ isActive }) => ({
                fontSize: '0.84rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#0f172a' : '#64748b',
                textDecoration: 'none'
              })}
            >
              Clinical Reference
            </NavLink>
          </div>
        )}

        {/* 2. ROLE = PATIENT (ONLY 1 NAV LINK: DASHBOARD) */}
        {isAuthenticated && activeRole === 'patient' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <NavLink
              to="/screening"
              className={({ isActive }) => (isActive ? 'active-link' : undefined)}
              style={({ isActive }) => ({
                fontSize: '0.84rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#0f172a' : '#64748b',
                textDecoration: 'none'
              })}
            >
              Dashboard
            </NavLink>
          </div>
        )}

        {/* 3. ROLE = OPERATOR (ONLY 1 NAV LINK: UPLOAD FUNDUS IMAGES) */}
        {isAuthenticated && activeRole === 'operator' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <NavLink
              to="/screening"
              className={({ isActive }) => (isActive ? 'active-link' : undefined)}
              style={({ isActive }) => ({
                fontSize: '0.84rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#0f172a' : '#64748b',
                textDecoration: 'none'
              })}
            >
              Upload Fundus Images
            </NavLink>
          </div>
        )}

        {/* 4. ROLE = DOCTOR (2 NAV LINKS: CLINICAL REFERENCE & SCREENING RESULTS) */}
        {isAuthenticated && activeRole === 'doctor' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <NavLink
              to="/reference"
              className={({ isActive }) => (isActive ? 'active-link' : undefined)}
              style={({ isActive }) => ({
                fontSize: '0.84rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#0f172a' : '#64748b',
                textDecoration: 'none'
              })}
            >
              Clinical Reference
            </NavLink>
            <NavLink
              to="/screening"
              className={({ isActive }) => (isActive ? 'active-link' : undefined)}
              style={({ isActive }) => ({
                fontSize: '0.84rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#0f172a' : '#64748b',
                textDecoration: 'none'
              })}
            >
              Screening Results
            </NavLink>
          </div>
        )}

        {/* 5. ROLE = ADMIN (ALL 4 NAV LINKS: OVERVIEW, CLINICAL REFERENCE, RUN SCREENING, CAPACITY MODEL) */}
        {isAuthenticated && activeRole === 'admin' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <NavLink
              to="/"
              end
              className={({ isActive }) => (isActive ? 'active-link' : undefined)}
              style={({ isActive }) => ({
                fontSize: '0.84rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#0f172a' : '#64748b',
                textDecoration: 'none'
              })}
            >
              Overview
            </NavLink>
            <NavLink
              to="/reference"
              className={({ isActive }) => (isActive ? 'active-link' : undefined)}
              style={({ isActive }) => ({
                fontSize: '0.84rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#0f172a' : '#64748b',
                textDecoration: 'none'
              })}
            >
              Clinical Reference
            </NavLink>
            <NavLink
              to="/screening"
              className={({ isActive }) => (isActive ? 'active-link' : undefined)}
              style={({ isActive }) => ({
                fontSize: '0.84rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#0f172a' : '#64748b',
                textDecoration: 'none'
              })}
            >
              Run Screening
            </NavLink>
            <NavLink
              to="/pipeline"
              className={({ isActive }) => (isActive ? 'active-link' : undefined)}
              style={({ isActive }) => ({
                fontSize: '0.84rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#0f172a' : '#64748b',
                textDecoration: 'none'
              })}
            >
              Capacity Model
            </NavLink>
          </div>
        )}
      </div>

      {/* Auth Actions, Language Selector & Clinical Role Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        <LanguageSelector />
        {isAuthenticated ? (
          <>
            {/* Professional Role Selector for testing */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#f8fafc', padding: '3px 8px', borderRadius: 5, border: '1px solid #cbd5e1' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Role:</span>
              <select
                value={activeRole}
                onChange={(e) => switchRole && switchRole(e.target.value)}
                title="Switch active role context"
                style={{
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  padding: '1px 4px',
                  borderRadius: 3,
                  border: 'none',
                  background: 'transparent',
                  color: '#0f172a',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                <option value="operator">Operator</option>
                <option value="doctor">Doctor</option>
                <option value="patient">Patient</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <span
              style={{
                fontSize: '0.82rem',
                color: '#475569',
                fontWeight: 500,
                maxWidth: 160,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
              title={user?.fullName || user?.email || user?.patientId}
            >
              {user?.fullName || user?.patientId || user?.email}
            </span>

            <button
              onClick={handleLogout}
              type="button"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '28px',
                background: 'transparent',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                padding: '0 0.75rem',
                fontSize: '0.78rem',
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                color: '#334155'
              }}
            >
              Sign Out
            </button>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <NavLink
              to="/login?mode=patient"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '30px',
                fontSize: '0.82rem',
                fontWeight: isPatientLoginActive ? 600 : 500,
                color: '#0f766e',
                background: isPatientLoginActive ? '#f0fdfa' : 'transparent',
                border: '1px solid #0f766e',
                borderRadius: '4px',
                padding: '0 0.75rem',
                textDecoration: 'none'
              }}
            >
              Patient Portal
            </NavLink>
            <NavLink
              to="/login?mode=staff"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '30px',
                fontSize: '0.82rem',
                fontWeight: isSignInActive ? 600 : 500,
                color: '#ffffff',
                background: '#0f172a',
                border: '1px solid #0f172a',
                borderRadius: '4px',
                padding: '0 0.85rem',
                textDecoration: 'none'
              }}
            >
              Staff Sign In
            </NavLink>
          </div>
        )}
      </div>
    </nav>
  )
}
