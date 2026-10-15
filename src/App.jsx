import { Routes, Route, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { LanguageProvider } from './context/LanguageContext'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Overview from './pages/Overview'
import Screening from './pages/Screening'
import Pipeline from './pages/Pipeline'
import Reference from './pages/Reference'
import Login from './pages/Login'

function AppContent() {
  const location = useLocation()
  const isLoginPage = location.pathname === '/login'

  return (
    <div
      style={{
        height: isLoginPage ? '100vh' : 'auto',
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: isLoginPage ? 'hidden' : 'visible',
        background: '#f8fafc'
      }}
    >
      {/* Slim, Edge-to-Edge Navbar with comfortable padding */}
      <header
        style={{
          width: '100%',
          height: '54px',
          background: '#ffffff',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          padding: '0 2.5rem',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          border: 'none',
          borderBottom: 'none',
          boxShadow: 'none'
        }}
      >
        <Navbar />
      </header>

      {/* Main Full-Width Content */}
      <main
        style={{
          flex: 1,
          width: '100%',
          display: isLoginPage ? 'flex' : 'block',
          alignItems: isLoginPage ? 'center' : undefined,
          justifyContent: isLoginPage ? 'center' : undefined,
          overflow: isLoginPage ? 'hidden' : 'visible'
        }}
      >
        {isLoginPage ? (
          <div
            style={{
              width: '100%',
              height: 'calc(100vh - 54px)',
              padding: '0 2.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box'
            }}
          >
            <Routes>
              <Route path="/login" element={<Login />} />
            </Routes>
          </div>
        ) : (
          <div style={{ width: '100%', padding: '2rem 2.5rem 4rem', boxSizing: 'border-box' }}>
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/reference" element={<Reference />} />
              <Route path="/login" element={<Login />} />
              <Route
                path="/screening"
                element={
                  <ProtectedRoute>
                    <Screening />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pipeline"
                element={
                  <ProtectedRoute>
                    <Pipeline />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <AppContent />
      </LanguageProvider>
    </AuthProvider>
  )
}
