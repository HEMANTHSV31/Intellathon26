import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const { isAuthenticated, user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const isSignInActive = location.pathname === '/login' && (!location.search || location.search.includes('signin'))
  const isSignUpActive = location.pathname === '/login' && location.search.includes('signup')

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
        borderBottom: 'none',
        textDecoration: 'none'
      }}
    >
      {/* Brand (plain text, no routing) & Main Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <span
          className="brand"
          style={{
            fontWeight: 700,
            fontSize: '0.92rem',
            letterSpacing: '-0.01em',
            color: '#0f172a',
            cursor: 'default',
            userSelect: 'none',
            textDecoration: 'none',
            borderBottom: 'none',
            lineHeight: 1
          }}
        >
          DR Screening
        </span>
        <NavLink
          to="/"
          end
          className={({ isActive }) => (isActive ? 'active-link' : undefined)}
          style={({ isActive }) => ({
            fontSize: '0.82rem',
            fontWeight: isActive ? 600 : 400,
            color: isActive ? '#0f172a' : '#64748b',
            textDecoration: 'none',
            borderBottom: 'none',
            lineHeight: 1
          })}
        >
          Overview
        </NavLink>
        <NavLink
          to="/reference"
          className={({ isActive }) => (isActive ? 'active-link' : undefined)}
          style={({ isActive }) => ({
            fontSize: '0.82rem',
            fontWeight: isActive ? 600 : 400,
            color: isActive ? '#0f172a' : '#64748b',
            textDecoration: 'none',
            borderBottom: 'none',
            lineHeight: 1
          })}
        >
          Clinical Reference
        </NavLink>
        {isAuthenticated && (
          <>
            <NavLink
              to="/screening"
              className={({ isActive }) => (isActive ? 'active-link' : undefined)}
              style={({ isActive }) => ({
                fontSize: '0.82rem',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? '#0f172a' : '#64748b',
                textDecoration: 'none',
                borderBottom: 'none',
                lineHeight: 1
              })}
            >
              Run Screening
            </NavLink>
            <NavLink
              to="/pipeline"
              className={({ isActive }) => (isActive ? 'active-link' : undefined)}
              style={({ isActive }) => ({
                fontSize: '0.82rem',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? '#0f172a' : '#64748b',
                textDecoration: 'none',
                borderBottom: 'none',
                lineHeight: 1
              })}
            >
              Capacity Model
            </NavLink>
          </>
        )}
      </div>

      {/* Auth Actions in Navbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        {isAuthenticated ? (
          <>
            <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
              {user?.email}
            </span>
            <button
              onClick={handleLogout}
              type="button"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '30px',
                background: 'transparent',
                border: '1px solid #cbd5e1',
                borderRadius: '5px',
                padding: '0 0.85rem',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                color: '#334155',
                boxSizing: 'border-box'
              }}
            >
              Sign Out
            </button>
          </>
        ) : (
          <>
            <NavLink
              to="/login?mode=signin"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '30px',
                fontSize: '0.84rem',
                fontWeight: isSignInActive ? 600 : 500,
                color: isSignInActive ? '#0d7a63' : '#475569',
                textDecoration: 'none',
                borderBottom: 'none',
                padding: '0 0.75rem',
                boxSizing: 'border-box'
              }}
            >
              Sign In
            </NavLink>
            <NavLink
              to="/login?mode=signup"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '30px',
                fontSize: '0.84rem',
                fontWeight: 600,
                color: isSignUpActive ? '#ffffff' : '#0d7a63',
                background: isSignUpActive ? '#0d7a63' : 'transparent',
                border: '1px solid #0d7a63',
                borderRadius: '5px',
                padding: '0 0.95rem',
                textDecoration: 'none',
                borderBottom: 'none',
                boxSizing: 'border-box',
                transition: 'all 0.15s ease'
              }}
            >
              Sign Up
            </NavLink>
          </>
        )}
      </div>
    </nav>
  )
}
