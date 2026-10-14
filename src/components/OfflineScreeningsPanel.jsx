import { useState, useEffect } from 'react'
import { getOfflineScreenings, deleteOfflineScreening } from '../utils/offlineDb'

export default function OfflineScreeningsPanel() {
  const [screenings, setScreenings] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)

  const loadRecords = async () => {
    try {
      setLoading(true)
      const list = await getOfflineScreenings(50)
      setScreenings(list)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRecords()

    const onSaved = () => loadRecords()
    const onDeleted = () => loadRecords()

    window.addEventListener('dr-screening-saved', onSaved)
    window.addEventListener('dr-screening-deleted', onDeleted)

    return () => {
      window.removeEventListener('dr-screening-saved', onSaved)
      window.removeEventListener('dr-screening-deleted', onDeleted)
    }
  }, [])

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (window.confirm('Delete this offline screening record from local IndexedDB?')) {
      await deleteOfflineScreening(id)
      await loadRecords()
    }
  }

  const handleExport = () => {
    if (screenings.length === 0) return
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(screenings, null, 2))
    const dlAnchor = document.createElement('a')
    dlAnchor.setAttribute('href', dataStr)
    dlAnchor.setAttribute('download', `dr_offline_screenings_${new Date().toISOString().slice(0, 10)}.json`)
    dlAnchor.click()
  }

  if (loading && screenings.length === 0) {
    return null
  }

  return (
    <section
      id="offline-history"
      style={{
        marginTop: '2.5rem',
        padding: '1.25rem',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a', fontWeight: 600 }}>
            Rural Clinic Local Records (IndexedDB)
          </h2>
          <p className="small" style={{ margin: '0.2rem 0 0', color: '#64748b' }}>
            {screenings.length === 0
              ? 'Screenings conducted in this browser are automatically backed up in IndexedDB for offline auditing and export.'
              : `${screenings.length} patient screening${screenings.length === 1 ? '' : 's'} stored offline in browser IndexedDB.`}
          </p>
        </div>

        {screenings.length > 0 && (
          <button
            type="button"
            onClick={handleExport}
            style={{
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              padding: '0.4rem 0.85rem',
              fontSize: '0.78rem',
              fontWeight: 600,
              color: '#334155',
              cursor: 'pointer',
              fontFamily: 'inherit'
            }}
          >
            Export Offline Log (.JSON)
          </button>
        )}
      </div>

      {screenings.length === 0 ? (
        <div style={{ padding: '1.25rem', textAlign: 'center', background: '#f8fafc', borderRadius: '6px', color: '#94a3b8', fontSize: '0.85rem' }}>
          No offline records saved yet. Run a screening above to see automatic IndexedDB persistence in action.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {screenings.map((item) => {
            const isExpanded = expandedId === item.id
            const isReferable = item.referable

            return (
              <div
                key={item.id}
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                style={{
                  border: `1px solid ${isReferable ? '#fecaca' : '#e2e8f0'}`,
                  borderRadius: '6px',
                  background: isReferable ? '#fff5f5' : '#f8fafc',
                  padding: '0.85rem 1rem',
                  cursor: 'pointer',
                  transition: 'background-color 0.1s ease'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        background: isReferable ? '#fee2e2' : '#e2e8f0',
                        color: isReferable ? '#991b1b' : '#334155'
                      }}
                    >
                      {isReferable ? 'REFERABLE DR' : 'NON-REFERABLE'}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: '0.86rem', color: '#0f172a' }}>
                      {item.fileName}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      {item.formattedDate}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(item.id, e)}
                      title="Delete local record"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        padding: '0.1rem 0.35rem'
                      }}
                    >
                      &times;
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: '0.85rem', paddingTop: '0.85rem', borderTop: '1px solid #cbd5e1', fontSize: '0.82rem', color: '#334155' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem', marginBottom: '0.5rem' }}>
                      <div>
                        <strong>DR Classifier:</strong> {item.drPrediction} ({((item.drScore || item.drConfidence) * 100).toFixed(1)}%)
                      </div>
                      <div>
                        <strong>Image Quality:</strong> {item.qualityVerdict}
                      </div>
                      <div>
                        <strong>Staged Assessment:</strong> {item.icdrGrade}
                      </div>
                    </div>

                    {item.recommendations && item.recommendations.length > 0 && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <strong>Clinical Guidance:</strong>
                        <ul style={{ margin: '0.25rem 0 0 1.25rem', padding: 0 }}>
                          {item.recommendations.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
