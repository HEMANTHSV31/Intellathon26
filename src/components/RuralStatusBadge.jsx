import { useState, useEffect } from 'react'
import { getRuralCacheStats } from '../utils/offlineDb'

export default function RuralStatusBadge() {
  const [stats, setStats] = useState({
    cachedRequests: 0,
    storedScreenings: 0,
    isModelCached: false,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true
  })
  const [isOpen, setIsOpen] = useState(false)
  const [cachingProgress, setCachingProgress] = useState(null)
  const [cacheMessage, setCacheMessage] = useState('')

  const refreshStats = async () => {
    try {
      const s = await getRuralCacheStats()
      setStats(s)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    refreshStats()

    const onOnline = () => {
      setStats(prev => ({ ...prev, isOnline: true }))
      refreshStats()
    }
    const onOffline = () => {
      setStats(prev => ({ ...prev, isOnline: false }))
      refreshStats()
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('dr-screening-saved', refreshStats)
    window.addEventListener('dr-screening-deleted', refreshStats)

    const interval = setInterval(refreshStats, 8000)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('dr-screening-saved', refreshStats)
      window.removeEventListener('dr-screening-deleted', refreshStats)
      clearInterval(interval)
    }
  }, [])

  const handlePrecacheModel = async () => {
    if (!window.tf) {
      setCacheMessage('TensorFlow.js is initializing, please try again in a few seconds.')
      return
    }

    try {
      setCachingProgress('Downloading model shards to browser IndexedDB...')
      setCacheMessage('')
      const model = await window.tf.loadLayersModel('/models/model.json')
      setCachingProgress('Saving 13.5MB model weights into IndexedDB...')
      await model.save('indexeddb://dr-classifier-model')
      setCachingProgress(null)
      setCacheMessage('MobileNet classifier model is now permanently saved in IndexedDB! It can be used 100% offline without internet.')
      await refreshStats()
    } catch (err) {
      setCachingProgress(null)
      setCacheMessage('Pre-cache error: ' + (err.message || err))
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title="IndexedDB Rural Offline Cache Status — Click to manage offline storage"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.45rem',
          padding: '0.22rem 0.65rem',
          borderRadius: '9999px',
          fontSize: '0.74rem',
          fontWeight: 600,
          background: stats.isOnline ? '#f0fdf4' : '#fffbeb',
          border: `1px solid ${stats.isOnline ? '#bbf7d0' : '#fde68a'}`,
          color: stats.isOnline ? '#166534' : '#92400e',
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'all 0.15s ease'
        }}
      >
        <span
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: stats.isOnline ? '#16a34a' : '#d97706',
            boxShadow: `0 0 0 2px ${stats.isOnline ? '#dcfce7' : '#fef3c7'}`
          }}
        />
        <span>
          {stats.isOnline ? 'Online (IndexedDB Active)' : 'Rural / Offline Mode'}
        </span>
      </button>

      {/* Rural Offline Storage Modal */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              maxWidth: '520px',
              width: '100%',
              padding: '1.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
              border: '1px solid #e2e8f0',
              boxSizing: 'border-box'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 700 }}>
                  Rural Clinic Offline Storage
                </h3>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                  IndexedDB client-side cache ensures seamless screening even with zero internet connectivity.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  padding: '0.2rem 0.5rem',
                  lineHeight: 1
                }}
              >
                &times;
              </button>
            </div>

            {/* Status Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.75rem',
                marginBottom: '1.25rem'
              }}
            >
              <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 500, textTransform: 'uppercase' }}>
                  Network Status
                </div>
                <div style={{ fontSize: '0.98rem', fontWeight: 600, color: stats.isOnline ? '#166534' : '#b45309', marginTop: '0.2rem' }}>
                  {stats.isOnline ? 'Connected (Online)' : 'No Connection (Offline)'}
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 500, textTransform: 'uppercase' }}>
                  MobileNet Classifier
                </div>
                <div style={{ fontSize: '0.98rem', fontWeight: 600, color: stats.isModelCached ? '#166534' : '#64748b', marginTop: '0.2rem' }}>
                  {stats.isModelCached ? 'Cached in IndexedDB' : 'Not Yet Cached'}
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 500, textTransform: 'uppercase' }}>
                  Cached API Requests
                </div>
                <div style={{ fontSize: '0.98rem', fontWeight: 600, color: '#0f172a', marginTop: '0.2rem' }}>
                  {stats.cachedRequests} requests cached
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 500, textTransform: 'uppercase' }}>
                  Local Screening Reports
                </div>
                <div style={{ fontSize: '0.98rem', fontWeight: 600, color: '#0f172a', marginTop: '0.2rem' }}>
                  {stats.storedScreenings} patient records
                </div>
              </div>
            </div>

            {/* Explanatory Note */}
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '0.85rem', marginBottom: '1.25rem', fontSize: '0.8rem', color: '#1e40af', lineHeight: 1.5 }}>
              <strong>How rural offline screening works:</strong> All morphological filters, optic disc detection, exudate/hemorrhage identification, and the TensorFlow.js deep learning model execute completely inside this browser. No retinal photos are ever transmitted off this device.
            </div>

            {cachingProgress && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#fefce8', border: '1px solid #fef08a', borderRadius: '6px', fontSize: '0.82rem', color: '#854d0e' }}>
                {cachingProgress}
              </div>
            )}

            {cacheMessage && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '0.82rem', color: '#166534' }}>
                {cacheMessage}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {!stats.isModelCached && (
                <button
                  type="button"
                  onClick={handlePrecacheModel}
                  disabled={!!cachingProgress}
                  style={{
                    background: '#0d7a63',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.55rem 1rem',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: cachingProgress ? 'wait' : 'pointer',
                    fontFamily: 'inherit'
                  }}
                >
                  {cachingProgress ? 'Caching...' : 'Pre-cache Model for Rural Use'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  background: '#f1f5f9',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  padding: '0.55rem 1rem',
                  fontSize: '0.82rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
