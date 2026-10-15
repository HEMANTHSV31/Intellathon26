import React, { useState, useEffect } from 'react'
import { useLanguage } from '../context/LanguageContext'

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'ta', label: 'தமிழ் (Tamil)' },
  { code: 'kn', label: 'ಕನ್ನಡ (Kannada)' },
  { code: 'mr', label: 'मराठी (Marathi)' },
  { code: 'te', label: 'తెలుగు (Telugu)' },
  { code: 'ml', label: 'മലയാളം (Malayalam)' },
  { code: 'bn', label: 'বাংলা (Bengali)' },
  { code: 'gu', label: 'ગુજરાતી (Gujarati)' }
]

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'))
  return match ? decodeURIComponent(match[3]) : null
}

export default function LanguageSelector() {
  const { setLanguage } = useLanguage()
  const [selectedLang, setSelectedLang] = useState('en')

  useEffect(() => {
    const googTrans = getCookie('googtrans')
    if (googTrans) {
      const match = googTrans.match(/\/en\/([a-z]{2})/)
      if (match && LANGUAGES.some(l => l.code === match[1])) {
        setSelectedLang(match[1])
        setLanguage(match[1])
        return
      }
    }
    const saved = localStorage.getItem('preferred_language') || 'en'
    if (LANGUAGES.some(l => l.code === saved)) {
      setSelectedLang(saved)
      setLanguage(saved)
    } else {
      setSelectedLang('en')
      setLanguage('en')
    }
  }, [setLanguage])

  const handleLanguageChange = (code) => {
    setSelectedLang(code)
    setLanguage(code)

    if (code === 'en') {
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname};`
      const combo = document.querySelector('.goog-te-combo')
      if (combo) {
        combo.value = 'en'
        combo.dispatchEvent(new Event('change'))
      }
      window.location.reload()
      return
    }

    const cookieVal = `/en/${code}`
    document.cookie = `googtrans=${cookieVal}; path=/;`
    document.cookie = `googtrans=${cookieVal}; path=/; domain=${window.location.hostname};`

    const combo = document.querySelector('.goog-te-combo')
    if (combo) {
      combo.value = code
      combo.dispatchEvent(new Event('change'))
    } else {
      window.location.reload()
    }
  }

  return (
    <div
      className="netflix-lang-wrapper notranslate"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: '6px',
        height: '32px',
        padding: '0 0.55rem',
        boxSizing: 'border-box',
        transition: 'all 0.15s ease',
        cursor: 'pointer'
      }}
    >
      {/* Netflix-style Globe Icon */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#475569"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ marginRight: '6px', flexShrink: 0, pointerEvents: 'none' }}
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>

      {/* Language Select Dropdown */}
      <select
        aria-label="Select Language"
        value={selectedLang}
        onChange={(e) => handleLanguageChange(e.target.value)}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontFamily: 'inherit',
          fontSize: '0.82rem',
          fontWeight: 500,
          color: '#1e293b',
          cursor: 'pointer',
          paddingRight: '14px',
          paddingLeft: '0',
          margin: 0,
          lineHeight: 1
        }}
      >
        {LANGUAGES.map((lang) => (
          <option
            key={lang.code}
            value={lang.code}
            style={{ color: '#0f172a', background: '#ffffff', fontSize: '0.85rem' }}
          >
            {lang.label}
          </option>
        ))}
      </select>

      {/* Down Chevron */}
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#64748b"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          position: 'absolute',
          right: '8px',
          pointerEvents: 'none'
        }}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  )
}
