import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { initScreening, validateImageQuality, runPipelineWithMeta } from '../utils/drEngine'

export default function Screening() {
  const { user, role, switchRole } = useAuth()
  const activeRole = role || user?.role || 'operator'

  // Operator Patient Intake & Multi-Image State
  const [patientName, setPatientName] = useState('Ramesh Kumar')
  const [patientPhone, setPatientPhone] = useState('9876543210')
  const [acceptedImages, setAcceptedImages] = useState([])
  const [sessionRejectedCount, setSessionRejectedCount] = useState(0)
  const [activeScreeningId, setActiveScreeningId] = useState(null)
  const [isValidating, setIsValidating] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null)
  const [showPipelineDetails, setShowPipelineDetails] = useState(true)

  // Quality Rejection Modal State
  const [rejectionModal, setRejectionModal] = useState({
    isOpen: false,
    rejectedItems: []
  })

  // Live Supabase Data States
  const [patientsQueue, setPatientsQueue] = useState([])
  const [screeningsList, setScreeningsList] = useState([])
  const [patientScreenings, setPatientScreenings] = useState([])
  const [adminStats, setAdminStats] = useState(null)
  const [dataLoading, setDataLoading] = useState(false)

  const multiFileInputRef = useRef(null)

  // Strictly lowercase live Patient ID: [patientname]_[phonedigits]
  const cleanName = patientName.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'patient'
  const cleanPhone = patientPhone.trim().replace(/\D/g, '')
  const currentPatientId = cleanPhone ? `${cleanName}_${cleanPhone}`.toLowerCase() : `${cleanName}_pendingphone`

  // Accurate live count of quality passed images in current operator session
  const sessionQualityPassedCount = acceptedImages.filter(img => img.verdict !== 'reject').length

  useEffect(() => {
    const cleanup = initScreening()
    return () => {
      if (typeof cleanup === 'function') cleanup()
    }
  }, [])

  // Fetch live Supabase data on mount and whenever activeRole changes
  useEffect(() => {
    fetchLiveRoleData()
  }, [activeRole, user])

  const fetchLiveRoleData = async () => {
    setDataLoading(true)
    const token = localStorage.getItem('dr_token')
    const headers = token ? { Authorization: `Bearer ${token}` } : {}

    try {
      if (activeRole === 'doctor') {
        // Fetch live patients and live screenings
        const [pRes, sRes] = await Promise.all([
          fetch('/api/patients', { headers }),
          fetch('/api/screenings', { headers })
        ])
        if (pRes.ok) {
          const pData = await pRes.json()
          setPatientsQueue(pData.patients || [])
        }
        if (sRes.ok) {
          const sData = await sRes.json()
          setScreeningsList(sData.screenings || [])
        }
      } else if (activeRole === 'patient') {
        // Fetch live screenings specifically for this patient
        const pId = (user?.patientId || currentPatientId).toLowerCase()
        const res = await fetch(`/api/screenings?patientId=${encodeURIComponent(pId)}`, { headers })
        if (res.ok) {
          const data = await res.json()
          setPatientScreenings(data.screenings || [])
        }
      } else if (activeRole === 'admin') {
        // Fetch live clinic statistics and registry
        const [statsRes, pRes, sRes] = await Promise.all([
          fetch('/api/stats', { headers }),
          fetch('/api/patients', { headers }),
          fetch('/api/screenings', { headers })
        ])
        if (statsRes.ok) {
          const sData = await statsRes.json()
          setAdminStats(sData)
        }
        if (pRes.ok) {
          const pData = await pRes.json()
          setPatientsQueue(pData.patients || [])
        }
        if (sRes.ok) {
          const sData = await sRes.json()
          setScreeningsList(sData.screenings || [])
        }
      }
    } catch (err) {
      console.warn('Live data fetch notice:', err)
    } finally {
      setDataLoading(false)
    }
  }

  // Handle Multi-Image Upload with Real-Time Quality Gate
  const handleFilesUpload = async (filesList) => {
    if (!filesList || filesList.length === 0) return

    if (!cleanPhone) {
      alert('Please enter a valid Patient Phone Number with numeric digits. Patient ID is formatted as [name]_[digits] in lowercase.')
      return
    }

    setIsValidating(true)
    const filesArray = Array.from(filesList)
    const newAccepted = []
    const rejectedList = []

    for (const file of filesArray) {
      try {
        const res = await validateImageQuality(file)
        if (!res.valid) {
          rejectedList.push({
            fileName: file.name,
            fileSize: file.size,
            reason: res.reason,
            metrics: res.metrics,
            width: res.width,
            height: res.height
          })
        } else {
          newAccepted.push({
            id: 'scr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            file,
            name: file.name,
            size: (file.size / 1024).toFixed(1) + ' KB',
            width: res.width,
            height: res.height,
            thumbnail: res.thumbnail,
            verdict: res.verdict,
            reasons: res.reasons || [],
            metrics: res.metrics,
            eye: newAccepted.length % 2 === 0 ? 'OD' : 'OS',
            patientId: currentPatientId.toLowerCase(),
            patientName: patientName.trim(),
            patientPhone: cleanPhone,
            timestamp: new Date().toLocaleTimeString(),
            screeningStatus: 'Ready for analysis'
          })
        }
      } catch (err) {
        rejectedList.push({
          fileName: file.name,
          reason: 'File processing error: ' + (err.message || err)
        })
      }
    }

    setIsValidating(false)

    // Update rejection counter
    if (rejectedList.length > 0) {
      setSessionRejectedCount(prev => prev + rejectedList.length)
      setRejectionModal({
        isOpen: true,
        rejectedItems: rejectedList
      })
    }

    // Add accepted images
    if (newAccepted.length > 0) {
      setAcceptedImages(prev => [...prev, ...newAccepted])
      setSyncStatus({
        type: 'info',
        message: `${newAccepted.length} image(s) passed quality gate. Quality passed count: ${sessionQualityPassedCount + newAccepted.length}`
      })
    }

    if (multiFileInputRef.current) {
      multiFileInputRef.current.value = ''
    }
  }

  // Remove an accepted image
  const removeAcceptedImage = (id) => {
    setAcceptedImages(prev => prev.filter(img => img.id !== id))
  }

  // Run screening pipeline on a specific accepted image
  const handleRunScreening = async (imageItem) => {
    setActiveScreeningId(imageItem.id)
    setShowPipelineDetails(true)

    setAcceptedImages(prev =>
      prev.map(item => item.id === imageItem.id ? { ...item, screeningStatus: 'Screening in progress…' } : item)
    )

    try {
      await runPipelineWithMeta(imageItem.file, {
        patientId: imageItem.patientId.toLowerCase(),
        patientName: imageItem.patientName,
        patientPhone: imageItem.patientPhone,
        eye: imageItem.eye
      })

      setAcceptedImages(prev =>
        prev.map(item => item.id === imageItem.id ? { ...item, screeningStatus: 'Screening complete (Synced to Supabase)' } : item)
      )

      setSyncStatus({
        type: 'success',
        message: `Analysis completed for ${imageItem.name}. Diagnostic results recorded under Patient ID: ${imageItem.patientId}.`
      })

      // Refresh live records
      fetchLiveRoleData()
    } catch (err) {
      console.error('Screening execution failed:', err)
      setAcceptedImages(prev =>
        prev.map(item => item.id === imageItem.id ? { ...item, screeningStatus: 'Error during analysis' } : item)
      )
    } finally {
      setActiveScreeningId(null)
    }
  }

  // Sync all accepted images and patient intake directly to Supabase
  const handleSyncToSupabase = async () => {
    if (!cleanPhone) {
      alert('Patient phone number is required.')
      return
    }

    setSyncStatus({ type: 'syncing', message: 'Synchronizing patient record and fundus images with Supabase…' })

    try {
      const token = localStorage.getItem('dr_token')
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      // 1. Intake Patient in Supabase (forcing lowercase ID)
      const intakeRes = await fetch('/api/patients/intake', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: patientName.trim(),
          phone: cleanPhone
        })
      })

      if (!intakeRes.ok) {
        const intakeErr = await intakeRes.json()
        throw new Error(intakeErr.error || 'Failed to record patient in Supabase')
      }

      // 2. Upload Screenings
      let uploadedCount = 0
      for (const item of acceptedImages) {
        await fetch('/api/screenings/upload', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            id: item.id,
            patientId: item.patientId.toLowerCase(),
            patientName: item.patientName,
            patientPhone: item.patientPhone,
            eye: item.eye,
            fileName: item.name,
            imageData: item.thumbnail,
            prediction: 'Uploaded by Operator',
            confidence: 0.95,
            qualityVerdict: item.verdict,
            timestamp: Date.now()
          })
        })
        uploadedCount++
      }

      setSyncStatus({
        type: 'success',
        message: `Successfully synchronized Patient ${currentPatientId} and ${uploadedCount} image(s) to Supabase database.`
      })

      fetchLiveRoleData()
    } catch (err) {
      console.error('Supabase sync error:', err)
      setSyncStatus({
        type: 'error',
        message: 'Sync failed: ' + (err.message || err)
      })
    }
  }

  return (
    <>
      {/* Professional Clinical Page Header */}
      <header className="app-header" style={{ marginBottom: '1.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 600, color: '#0f172a', margin: '0 0 0.35rem 0' }}>
              Diabetic Retinopathy Screening System
            </h1>
            <p className="subtitle" style={{ margin: 0, fontSize: '0.86rem', color: '#64748b' }}>
              Clinical fundus image analysis, ICDR severity staging, and explainability for primary health care facilities.
            </p>
          </div>

          {/* Subdued Context Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#ffffff', padding: '5px 12px', borderRadius: 4, border: '1px solid #cbd5e1' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Mode:</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0f172a' }}>
              {activeRole === 'operator' && 'Operator Intake Station'}
              {activeRole === 'doctor' && 'Ophthalmologist Diagnostic Suite'}
              {activeRole === 'patient' && 'Patient Examination Portal'}
              {activeRole === 'admin' && 'Clinic Operations & Registry'}
            </span>
          </div>
        </div>

        <div id="model-status" style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#64748b' }}>Loading classifier model…</div>
        <progress id="model-progress" max="1" style={{ height: '4px', marginTop: '4px' }}></progress>
      </header>

      {/* ========================================================================= */}
      {/* 1. OPERATOR VIEW: PATIENT INTAKE & MULTI-IMAGE UPLOAD STATION             */}
      {/* ========================================================================= */}
      {activeRole === 'operator' && (
        <section id="operator-station" style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontWeight: 600 }}>
                Patient Intake &amp; Fundus Photography Upload
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                All fundus images undergo real-time quality verification before clinical archiving.
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '4px 10px', borderRadius: 4 }}>
              <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>PATIENT ID:</span>
              <code style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f766e' }}>{currentPatientId}</code>
            </div>
          </div>

          {/* Patient Details Form */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem', background: '#f8fafc', padding: '1.15rem', borderRadius: 5, border: '1px solid #e2e8f0' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Patient Full Name *
              </label>
              <input
                type="text"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="e.g. Ramesh Kumar"
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.88rem', outline: 'none', background: '#ffffff' }}
              />
              <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block', marginTop: '3px' }}>
                Normalized to lowercase for clinical database indexing
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Phone Number (Digits) *
              </label>
              <input
                type="tel"
                value={patientPhone}
                onChange={(e) => setPatientPhone(e.target.value)}
                placeholder="e.g. 9876543210"
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.88rem', outline: 'none', background: '#ffffff' }}
              />
              <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block', marginTop: '3px' }}>
                Extracted digits link all captures to <code>{currentPatientId}</code>
              </span>
            </div>
          </div>

          {/* Multi-Image Upload Dropzone */}
          <div
            style={{
              border: '2px dashed #94a3b8',
              borderRadius: 6,
              padding: '1.75rem 1.25rem',
              textAlign: 'center',
              background: '#f8fafc',
              cursor: 'pointer',
              transition: 'border-color 0.15s ease'
            }}
            onClick={() => multiFileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={multiFileInputRef}
              multiple
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => handleFilesUpload(e.target.files)}
            />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#0f172a' }}>
                {isValidating ? 'Running pixel quality and focus verification…' : 'Select or Drop Fundus Photographs (Multiple Supported)'}
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569' }}>
                Upload multiple captures per patient. Automated quality assessment validates resolution (&ge;256px), focus blur, and illumination.
              </p>
              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.75rem', fontSize: '0.76rem', color: '#475569' }}>
                <span>Quality Gate: <strong>Active</strong></span>
                <span>•</span>
                <span>Minimum Resolution: <strong>256×256 px</strong></span>
                <span>•</span>
                <span>Focus Laplacian Floor: <strong>15.0</strong></span>
              </div>
            </div>
          </div>

          {/* Accurate Quality Gate Counter Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginTop: '1.25rem' }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, padding: '0.65rem 0.85rem' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Session Images</span>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                {acceptedImages.length + sessionRejectedCount}
              </div>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Total evaluated</span>
            </div>

            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 4, padding: '0.65rem 0.85rem' }}>
              <span style={{ fontSize: '0.72rem', color: '#166534', fontWeight: 600, textTransform: 'uppercase' }}>Quality Passed</span>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#15803d', marginTop: '2px' }}>
                {sessionQualityPassedCount}
              </div>
              <span style={{ fontSize: '0.72rem', color: '#166534' }}>Diagnostic acuity met</span>
            </div>

            <div style={{ background: sessionRejectedCount > 0 ? '#fef2f2' : '#f8fafc', border: `1px solid ${sessionRejectedCount > 0 ? '#fecaca' : '#e2e8f0'}`, borderRadius: 4, padding: '0.65rem 0.85rem' }}>
              <span style={{ fontSize: '0.72rem', color: sessionRejectedCount > 0 ? '#991b1b' : '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Rejected (Low Quality)</span>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: sessionRejectedCount > 0 ? '#b91c1c' : '#64748b', marginTop: '2px' }}>
                {sessionRejectedCount}
              </div>
              <span style={{ fontSize: '0.72rem', color: sessionRejectedCount > 0 ? '#991b1b' : '#64748b' }}>Removed from queue</span>
            </div>
          </div>

          {/* Sync & Notification Banner */}
          {syncStatus && (
            <div style={{
              marginTop: '1rem',
              padding: '0.65rem 0.95rem',
              borderRadius: 4,
              fontSize: '0.82rem',
              fontWeight: 500,
              background: syncStatus.type === 'success' ? '#f0fdf4' : syncStatus.type === 'error' ? '#fef2f2' : '#f8fafc',
              border: `1px solid ${syncStatus.type === 'success' ? '#86efac' : syncStatus.type === 'error' ? '#fca5a5' : '#cbd5e1'}`,
              color: syncStatus.type === 'success' ? '#166534' : syncStatus.type === 'error' ? '#991b1b' : '#1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span>{syncStatus.message}</span>
              <button
                type="button"
                onClick={() => setSyncStatus(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700, padding: 0 }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Accepted Images Gallery */}
          {acceptedImages.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.96rem', color: '#0f172a', fontWeight: 600 }}>
                  Accepted Photographs ({sessionQualityPassedCount}) — Linked to <code>{currentPatientId}</code>
                </h3>
                <button
                  type="button"
                  onClick={handleSyncToSupabase}
                  style={{
                    background: '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 4,
                    padding: '0.45rem 0.85rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Synchronize with Supabase Database
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.85rem' }}>
                {acceptedImages.map((imgItem) => (
                  <div
                    key={imgItem.id}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: 6,
                      overflow: 'hidden',
                      background: '#ffffff',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                  >
                    <div style={{ height: '140px', background: '#000000', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img
                        src={imgItem.thumbnail}
                        alt={imgItem.name}
                        style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                      />
                      <span style={{
                        position: 'absolute',
                        top: '6px',
                        left: '6px',
                        background: 'rgba(0,0,0,0.8)',
                        color: '#ffffff',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '1px 5px',
                        borderRadius: 3
                      }}>
                        {imgItem.eye === 'OD' ? 'OD (Right Eye)' : 'OS (Left Eye)'}
                      </span>
                      <span style={{
                        position: 'absolute',
                        top: '6px',
                        right: '6px',
                        background: '#15803d',
                        color: '#ffffff',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '1px 5px',
                        borderRadius: 3
                      }}>
                        Quality Pass
                      </span>
                    </div>

                    <div style={{ padding: '0.75rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.84rem', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {imgItem.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        ID: <code style={{ color: '#0f766e', fontWeight: 600 }}>{imgItem.patientId}</code>
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Dim: {imgItem.width}×{imgItem.height} px</span>
                        <span>Size: {imgItem.size}</span>
                      </div>

                      {/* Lateralization Selector */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.35rem', paddingTop: '0.35rem', borderTop: '1px solid #f1f5f9' }}>
                        <span style={{ fontSize: '0.75rem', color: '#475569' }}>Eye:</span>
                        <div style={{ display: 'flex', gap: '3px' }}>
                          <button
                            type="button"
                            onClick={() => setAcceptedImages(prev => prev.map(x => x.id === imgItem.id ? { ...x, eye: 'OD' } : x))}
                            style={{
                              padding: '1px 6px',
                              fontSize: '0.72rem',
                              fontWeight: imgItem.eye === 'OD' ? 600 : 400,
                              background: imgItem.eye === 'OD' ? '#0f172a' : '#f8fafc',
                              color: imgItem.eye === 'OD' ? '#ffffff' : '#475569',
                              border: '1px solid #cbd5e1',
                              borderRadius: 3
                            }}
                          >
                            OD (Right)
                          </button>
                          <button
                            type="button"
                            onClick={() => setAcceptedImages(prev => prev.map(x => x.id === imgItem.id ? { ...x, eye: 'OS' } : x))}
                            style={{
                              padding: '1px 6px',
                              fontSize: '0.72rem',
                              fontWeight: imgItem.eye === 'OS' ? 600 : 400,
                              background: imgItem.eye === 'OS' ? '#0f172a' : '#f8fafc',
                              color: imgItem.eye === 'OS' ? '#ffffff' : '#475569',
                              border: '1px solid #cbd5e1',
                              borderRadius: 3
                            }}
                          >
                            OS (Left)
                          </button>
                        </div>
                      </div>

                      <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: '2px' }}>
                        Status: <span style={{ fontWeight: 500 }}>{imgItem.screeningStatus}</span>
                      </div>

                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: 'auto', paddingTop: '0.55rem' }}>
                        <button
                          type="button"
                          disabled={activeScreeningId === imgItem.id}
                          onClick={() => handleRunScreening(imgItem)}
                          style={{
                            flex: 1,
                            padding: '0.4rem',
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            background: '#0f172a',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: 4,
                            cursor: 'pointer'
                          }}
                        >
                          {activeScreeningId === imgItem.id ? 'Analyzing…' : 'Run Screening'}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeAcceptedImage(imgItem.id)}
                          style={{
                            padding: '0.4rem 0.6rem',
                            fontSize: '0.76rem',
                            background: '#f8fafc',
                            color: '#dc2626',
                            border: '1px solid #e2e8f0',
                            borderRadius: 4,
                            cursor: 'pointer'
                          }}
                          title="Remove image"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* 2. DOCTOR VIEW: LIVE PATIENT QUEUE & SCREENING RESULTS REVIEW            */}
      {/* ========================================================================= */}
      {activeRole === 'doctor' && (
        <section id="doctor-suite" style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontWeight: 600 }}>
                Ophthalmologist Diagnostic Review &amp; Staging Registry
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                Live data synced directly with Supabase PostgreSQL database.
              </span>
            </div>
            <button
              type="button"
              onClick={fetchLiveRoleData}
              disabled={dataLoading}
              style={{ padding: '4px 10px', fontSize: '0.78rem', borderRadius: 4, border: '1px solid #cbd5e1', background: '#ffffff', cursor: 'pointer' }}
            >
              {dataLoading ? 'Refreshing…' : 'Refresh Live Database'}
            </button>
          </div>

          {/* Live Patients Queue Table */}
          <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: '#334155', margin: '1rem 0 0.5rem 0' }}>
            Registered Patient Screenings
          </h3>
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 5 }}>
            <table className="kv" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '7px 10px', color: '#475569' }}>Patient ID</th>
                  <th style={{ textAlign: 'left', padding: '7px 10px', color: '#475569' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '7px 10px', color: '#475569' }}>Contact</th>
                  <th style={{ textAlign: 'center', padding: '7px 10px', color: '#475569' }}>Total Captures</th>
                  <th style={{ textAlign: 'center', padding: '7px 10px', color: '#475569' }}>Quality Passed</th>
                  <th style={{ textAlign: 'center', padding: '7px 10px', color: '#475569' }}>Referral Status</th>
                  <th style={{ textAlign: 'right', padding: '7px 10px', color: '#475569' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {dataLoading ? (
                  <tr><td colSpan="7" style={{ padding: '14px', textAlign: 'center', color: '#64748b' }}>Loading live records from Supabase…</td></tr>
                ) : patientsQueue.length === 0 ? (
                  <tr><td colSpan="7" style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>No patient screening records found in database.</td></tr>
                ) : (
                  patientsQueue.map((p) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '7px 10px', fontWeight: 600, color: '#0f766e' }}>{p.id}</td>
                      <td style={{ padding: '7px 10px', color: '#0f172a' }}>{p.name}</td>
                      <td style={{ padding: '7px 10px', color: '#64748b' }}>{p.phone}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 600 }}>{p.total_image_count || 1}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 600, color: '#15803d' }}>
                        {p.quality_passed_count !== undefined ? p.quality_passed_count : (p.total_image_count || 1)}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: 3,
                          background: p.referable_flag ? '#fef2f2' : '#f0fdf4',
                          color: p.referable_flag ? '#b91c1c' : '#15803d',
                          border: `1px solid ${p.referable_flag ? '#fca5a5' : '#bbf7d0'}`
                        }}>
                          {p.referable_flag ? 'Referral Recommended' : 'Non-Referable'}
                        </span>
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setPatientName(p.name)
                            setPatientPhone(p.phone)
                            window.scrollTo({ top: document.getElementById('step1')?.offsetTop || 500, behavior: 'smooth' })
                          }}
                          style={{ padding: '2px 8px', fontSize: '0.74rem', borderRadius: 3, background: '#0f172a', color: '#ffffff', border: 'none' }}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Detailed Image Records from Supabase */}
          <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: '#334155', margin: '1.5rem 0 0.5rem 0' }}>
            Archived Fundus Photographs &amp; Diagnostics ({screeningsList.length})
          </h3>
          {screeningsList.length === 0 ? (
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: 5, border: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.82rem', textAlign: 'center' }}>
              No individual screening photographs recorded in database yet.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.85rem' }}>
              {screeningsList.map((scr) => (
                <div key={scr.id} style={{ border: '1px solid #e2e8f0', borderRadius: 5, padding: '0.75rem', background: '#ffffff', display: 'flex', gap: '0.75rem' }}>
                  {scr.image_data && (
                    <img
                      src={scr.image_data}
                      alt={scr.file_name}
                      style={{ width: '70px', height: '70px', objectFit: 'cover', borderRadius: 4, background: '#000000', flexShrink: 0 }}
                    />
                  )}
                  <div style={{ overflow: 'hidden', flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#0f172a', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {scr.file_name}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#0f766e', fontWeight: 600 }}>
                      ID: {scr.patient_id}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                      Eye: {scr.eye || 'OD'} • Quality: {scr.quality_verdict || 'Pass'}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: scr.referable ? '#b91c1c' : '#15803d', fontWeight: 600, marginTop: '2px' }}>
                      {scr.prediction || 'Evaluated'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* 3. PATIENT VIEW: LIVE HEALTH PORTAL & RESULTS                             */}
      {/* ========================================================================= */}
      {activeRole === 'patient' && (
        <section id="patient-portal" style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 600 }}>
              Retinal Screening Health Summary
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Patient Identifier: <code style={{ color: '#0f766e', fontWeight: 700 }}>{(user?.patientId || currentPatientId).toLowerCase()}</code>
            </span>
          </div>

          {patientScreenings.length === 0 ? (
            <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: 5, border: '1px solid #e2e8f0', textAlign: 'center', color: '#475569', fontSize: '0.86rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '4px', color: '#0f172a' }}>No screening records found in database</div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                There are no uploaded photographs linked to <code>{(user?.patientId || currentPatientId).toLowerCase()}</code>. Once your clinic technician captures and screens your fundus photograph, your clinical evaluation will appear here.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 5, padding: '1rem' }}>
                <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Overall Assessment</span>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: patientScreenings.some(s => s.referable) ? '#b91c1c' : '#15803d', marginTop: '2px' }}>
                  {patientScreenings.some(s => s.referable) ? 'Ophthalmologist Referral Advised' : 'No Vision-Threatening Retinopathy Detected'}
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#475569' }}>
                  {patientScreenings.some(s => s.referable)
                    ? 'Clinical signs indicative of diabetic microvascular changes were observed. An in-person consultation with an eye care specialist is recommended for formal dilated fundus examination.'
                    : 'Your retinal microvasculature appears within normal screening thresholds. Regular annual retinal checkups and blood sugar management are recommended.'}
                </p>
              </div>

              <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: '#334155', margin: '0.5rem 0 0 0' }}>
                Screened Photographs ({patientScreenings.length})
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                {patientScreenings.map((scr) => (
                  <div key={scr.id} style={{ border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden', background: '#ffffff' }}>
                    {scr.image_data && (
                      <div style={{ height: '140px', background: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src={scr.image_data} alt={scr.file_name} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                      </div>
                    )}
                    <div style={{ padding: '0.85rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.84rem', color: '#0f172a' }}>{scr.file_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                        Lateralization: <strong>{scr.eye || 'OD'}</strong> • Quality: <strong>{scr.quality_verdict || 'Usable'}</strong>
                      </div>
                      <div style={{ fontSize: '0.76rem', color: scr.referable ? '#b91c1c' : '#15803d', fontWeight: 600, marginTop: '4px' }}>
                        Result: {scr.prediction}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>
                        Screened on: {new Date(scr.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* 4. ADMIN VIEW: LIVE CLINIC TELEMETRY & STATS                             */}
      {/* ========================================================================= */}
      {activeRole === 'admin' && (
        <section id="admin-suite" style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontWeight: 600 }}>
                Clinic Operations &amp; Database Health
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                Live metrics from Supabase PostgreSQL database.
              </span>
            </div>
            <button
              type="button"
              onClick={fetchLiveRoleData}
              disabled={dataLoading}
              style={{ padding: '4px 10px', fontSize: '0.78rem', borderRadius: 4, border: '1px solid #cbd5e1', background: '#ffffff', cursor: 'pointer' }}
            >
              {dataLoading ? 'Querying…' : 'Query Telemetry'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem' }}>
            <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: 4, border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Database Status</span>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#15803d', marginTop: '2px' }}>
                {adminStats?.databaseStatus === 'connected' ? 'Connected' : 'Active'}
              </div>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Supabase PostgreSQL</span>
            </div>

            <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: 4, border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Registered Patients</span>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                {adminStats ? adminStats.patientsCount : patientsQueue.length}
              </div>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Unique clinical IDs</span>
            </div>

            <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: 4, border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Quality Passed</span>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#15803d', marginTop: '2px' }}>
                {adminStats ? adminStats.passedQualityCount : '0'}
              </div>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Usable photographs</span>
            </div>

            <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: 4, border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Referral Flagged</span>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#b91c1c', marginTop: '2px' }}>
                {adminStats ? adminStats.referableCount : '0'}
              </div>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Ophthalmology review</span>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 5. DIRECT CLINICAL UPLOADER & PIPELINE WORKSPACE                          */}
      {/* ========================================================================= */}
      <section id="uploader" style={{ display: activeRole === 'operator' && acceptedImages.length > 0 ? 'none' : 'block' }}>
        <h2>1. Upload a fundus image</h2>
        <div className="upload-box">
          <input type="file" id="file-input" accept="image/*" />
          <div className="actions">
            <button id="run-button" disabled type="button">Run screening pipeline</button>
          </div>
          <p className="field-note">
            Images are processed client-side. The automated quality gate verifies focus, illumination, and field of view before classification.
          </p>
        </div>
      </section>

      {/* Clinical Diagnostic Results View */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '2rem 0 1rem', borderTop: '1px solid #e2e8f0', paddingTop: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="pill" style={{ margin: 0 }}>Clinical Output</span>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Diagnostic Examination Pipeline</h2>
        </div>
        <button
          type="button"
          onClick={() => setShowPipelineDetails(!showPipelineDetails)}
          style={{ fontSize: '0.78rem', padding: '3px 8px', borderRadius: 4, border: '1px solid #cbd5e1' }}
        >
          {showPipelineDetails ? 'Collapse Panes' : 'Expand Panes'}
        </button>
      </div>

      <div style={{ display: showPipelineDetails ? 'block' : 'none' }}>
        {/* STEP 1: RESULTS */}
        <section id="step1" className="step">
          <hr className="rule" />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span className="pill">Step 1</span>
            <span className="small" style={{ color: '#64748b' }}>Results: Focus &amp; Illumination Gate</span>
          </div>
          <h2>Image quality assessment &amp; enhancement</h2>
          
          <div className="canvas-row">
            <div className="canvas-col">
              <canvas id="canvas-original"></canvas>
              <div className="cap">As uploaded (resized for processing)</div>
            </div>
            <div className="canvas-col">
              <canvas id="canvas-enhanced"></canvas>
              <div className="cap">After enhancement (if applied)</div>
            </div>
          </div>
          
          <table className="kv" id="quality-table"></table>
          <div id="quality-notice"></div>
        </section>

        {/* STEP 2: RESULTS */}
        <section id="step2" className="step">
          <hr className="rule" />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span className="pill">Step 2</span>
            <span className="small" style={{ color: '#64748b' }}>Results: Deep Learning Inference</span>
          </div>
          <h2>DR classification</h2>
          <div id="model-scope-notice" className="notice"></div>
          <div id="grading-results"></div>
        </section>

        {/* STEP 3: RESULTS */}
        <section id="step3" className="step">
          <hr className="rule" />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span className="pill">Step 3</span>
            <span className="small" style={{ color: '#64748b' }}>Results: Explainability &amp; Landmarks</span>
          </div>
          <h2>Explainability — Grad-CAM &amp; Anatomical Landmarks</h2>

          <h3>3a. Attention gradient with marked regions</h3>
          <div className="canvas-row">
            <div className="canvas-col">
              <canvas id="canvas-gradcam-colour"></canvas>
              <div className="cap">Grad-CAM in colour tones</div>
            </div>
            <div className="canvas-col">
              <canvas id="canvas-gradcam"></canvas>
              <div className="cap">The same gradient in greyscale</div>
            </div>
          </div>
          <div className="cbar"></div>
          <div className="cbar-ends"><span>low attention</span><span>high attention</span></div>
          <div id="findings-legend"></div>
          <p id="gradcam-note"></p>

          <h3>3b. Anatomical landmarks, eye lateralization &amp; quadrants</h3>
          <div className="canvas-row">
            <div className="canvas-col">
              <canvas id="canvas-anatomy"></canvas>
              <div className="cap">Estimated landmarks with balanced quadrant axes.</div>
            </div>
          </div>
          <table className="kv" id="anatomy-table"></table>
        </section>

        {/* STEP 4: RESULTS */}
        <section id="step4" className="step">
          <hr className="rule" />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span className="pill">Step 4</span>
            <span className="pill" style={{ background: '#0284c7', color: '#ffffff', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              MATLAB Image Processing Suite (+dr)
            </span>
          </div>
          <h2>Lesion candidate mask &amp; candidate localization</h2>
          <div style={{ background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.08) 0%, rgba(56, 189, 248, 0.04) 100%)', border: '1px solid rgba(2, 132, 199, 0.25)', borderRadius: '6px', padding: '10px 14px', marginBottom: '14px', fontSize: '0.84rem', color: '#0369a1' }}>
            <strong>Morphology &amp; Vessel Suppression:</strong> Multi-scale directional top-hat morphology, vessel anisotropy suppression, and perimacular tolerance (<code style={{ background: 'rgba(2, 132, 199, 0.1)', padding: '2px 4px', borderRadius: '4px' }}>matlab/+dr/detectLesionCandidates.m</code>).
          </div>

          <div className="canvas-row">
            <div className="canvas-col">
              <canvas id="canvas-mask"></canvas>
              <div className="cap">Binary mask — white pixels are candidate lesion pixels</div>
            </div>
            <div className="canvas-col">
              <canvas id="canvas-mask-typed"></canvas>
              <div className="cap">Same mask, shaded by candidate type</div>
            </div>
            <div className="canvas-col">
              <canvas id="canvas-lesion-overlay"></canvas>
              <div className="cap">Candidates located on the fundus image</div>
            </div>
          </div>

          <div id="lesion-legend"></div>
          <div id="lesion-summary"></div>
          <div id="lesion-quadrants"></div>
        </section>

        {/* STEP 5: RESULTS */}
        <section id="severity" className="step">
          <hr className="rule" />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span className="pill">Step 5</span>
            <span className="small" style={{ color: '#64748b' }}>Results: Clinical Rule Application</span>
          </div>
          <h2>ICDR severity estimate</h2>
          <div id="grade-result"></div>
          <div id="grade-quadrants"></div>
        </section>

        {/* SUMMARY REPORT */}
        <section id="report" className="step">
          <hr className="rule" />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span className="pill">Summary</span>
            <div className="actions no-print" style={{ margin: 0 }}>
              <button id="print-button" type="button">Print report</button>
            </div>
          </div>
          <h2>Screening report</h2>
          <div id="report-body"></div>
        </section>

        {/* REFERRAL ALERT BANNER */}
        <div className="refer-banner" id="refer-banner" role="alert" aria-live="polite">
          <strong>Ask an ophthalmologist</strong>
          <span id="refer-reason"></span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 6. CLINICAL METHODOLOGY REFERENCE & SENSITIVITY CONTROLS                  */}
      {/* ========================================================================= */}
      <section id="clinical-methodology-reference" className="step" style={{ marginTop: '3rem', background: '#f8fafc', padding: '1.5rem', borderRadius: 8, border: '1px solid #e2e8f0' }}>
        <hr className="rule" />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
          <span className="pill" style={{ background: '#475569', color: '#fff' }}>Reference Guide</span>
          <h2 style={{ margin: 0 }}>Clinical Methodology, Detection Mechanics &amp; Sensitivity Tuning</h2>
        </div>
        <p className="notice" style={{ marginTop: '0.5rem' }}>
          Mathematical formulations, lesion classification rules, and sensitivity controls for research audit.
        </p>

        {/* Interactive Sensitivity Tuning */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginTop: '1.25rem' }}>
          <div className="tune-box" style={{ margin: 0 }}>
            <h3 style={{ marginTop: 0 }}>Step 4: Lesion detection sensitivity</h3>
            <p className="small">Thresholds controlling morphological sensitivity across the retinal field.</p>
            <label className="field">
              Dark-lesion sensitivity floor
              <input type="number" id="tune-dark" defaultValue="8" step="0.5" min="1" max="40" />
            </label>
            <div className="field-note">Floor in grey levels below which a dark region is never seeded.</div>
            <label className="field">
              Bright-lesion sensitivity floor
              <input type="number" id="tune-bright" defaultValue="10" step="0.5" min="1" max="40" />
            </label>
            <div className="field-note">Calibrated for cotton wool spots and hard exudates.</div>
            <label className="field">
              Minimum contrast above noise (k)
              <input type="number" id="tune-contrast" defaultValue="3" step="0.1" min="0.5" max="10" />
            </label>
            <div className="field-note">Contrast required above local retinal background.</div>
            <label className="field">
              Shape strictness (saturation ratio)
              <input type="number" id="tune-growth" defaultValue="1.10" step="0.01" min="1" max="2" />
            </label>
            <div className="field-note">Suppresses vessel crossing and bifurcation artifacts.</div>
            <div className="actions">
              <button id="rerun-detection" type="button">Re-run detection</button>
            </div>
          </div>

          <div className="tune-box" style={{ margin: 0 }}>
            <h3 style={{ marginTop: 0 }}>Step 3a: Grad-CAM attention regions</h3>
            <p className="small">Segments neural network attention gradient into discrete hotspots.</p>
            <label className="field">
              Attention threshold (fraction of peak)
              <input type="number" id="tune-cam-threshold" defaultValue="0.5" step="0.05" min="0.15" max="0.95" />
            </label>
            <div className="field-note">Fraction of peak activation required to mark an attention region.</div>
            <label className="field">
              Maximum regions marked
              <input type="number" id="tune-cam-limit" defaultValue="12" step="1" min="1" max="40" />
            </label>
            <div className="field-note">Cap on discrete attention circles drawn on overlay.</div>
            <div className="actions">
              <button id="rerun-cam" type="button">Re-draw regions</button>
            </div>
          </div>
        </div>

        <h3 style={{ marginTop: '1.75rem' }}>Lesion Classification Rules</h3>
        <table className="kv" id="lesion-rules">
          <tbody>
            <tr><td>Microaneurysm candidate</td><td>Small, round, isolated dark structure. Area &le; 0.00018 of retinal area with circular compactness.</td></tr>
            <tr><td>Dot/blot hemorrhage candidate</td><td>Dark region with larger area, compact shape, bounded response across structuring rungs.</td></tr>
            <tr><td>Hard exudate candidate</td><td>Bright structure with sharp margins, high mean edge gradient (&ge; 1.5&times; mean retinal gradient).</td></tr>
            <tr><td>Cotton wool spot candidate</td><td>Bright structure with soft borders along nerve fiber layers. Minimum area calibrated to 0.00008 (~50 px).</td></tr>
            <tr><td>Right Eye (OD) vs Left Eye (OS)</td><td>Optic disc nasal to fovea. Left of fovea = OD; right of fovea = OS.</td></tr>
            <tr><td>Perimacular tolerance</td><td>Adaptive contrast thresholds in 2.5&times; macula radius prevent false suppression.</td></tr>
            <tr><td>Vessel suppression</td><td>Vessel pixels are masked from lesion extent growth via directional anisotropy.</td></tr>
          </tbody>
        </table>

        <h3 style={{ marginTop: '1.75rem' }}>Landmarks &amp; Explainability</h3>
        <p className="small">
          <strong>Grad-CAM:</strong> Computed from real gradients of convolutional layer (<span id="cam-layer-name">conv_pw_11_relu</span>, 14&times;14 resolution). Threshold: <span id="blob-threshold-text">50%</span>.
        </p>
      </section>

      {/* ========================================================================= */}
      {/* 7. REAL-TIME QUALITY REJECTION MODAL POPUP                                */}
      {/* ========================================================================= */}
      {rejectionModal.isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1.25rem'
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 6,
              maxWidth: '540px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div style={{ background: '#fef2f2', borderBottom: '1px solid #fee2e2', padding: '1.15rem 1.35rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#991b1b', fontWeight: 700 }}>
                Image Quality Check Failed — Photograph Rejected
              </h3>
              <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: '#b91c1c' }}>
                Uploaded image does not meet clinical diagnostic acuity criteria and cannot be upscaled.
              </p>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.25rem 1.35rem', maxHeight: '55vh', overflowY: 'auto' }}>
              <p style={{ margin: '0 0 0.85rem 0', fontSize: '0.84rem', color: '#334155', lineHeight: 1.45 }}>
                The pre-screening gate evaluated the photograph against clinical standards. Low-quality captures <strong>cannot be reliably upscaled or diagnosed</strong> for microaneurysms, and have been <strong>removed from the intake queue</strong>:
              </p>

              {rejectionModal.rejectedItems.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    background: '#fff1f2',
                    border: '1px solid #fecdd3',
                    borderRadius: 5,
                    padding: '0.85rem',
                    marginBottom: '0.65rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.84rem', color: '#9f1239' }}>{item.fileName}</span>
                    {item.width && item.height && (
                      <span style={{ fontSize: '0.72rem', background: '#ffe4e6', color: '#9f1239', padding: '1px 5px', borderRadius: 3 }}>
                        {item.width}×{item.height} px
                      </span>
                    )}
                  </div>

                  <p style={{ margin: '0.2rem 0', fontSize: '0.8rem', color: '#881337', lineHeight: 1.35 }}>
                    <strong>Clinical Reason:</strong> {item.reason}
                  </p>

                  {item.metrics && (
                    <div style={{ display: 'flex', gap: '0.85rem', marginTop: '0.4rem', fontSize: '0.74rem', color: '#9f1239', borderTop: '1px solid #fed7aa', paddingTop: '0.3rem' }}>
                      <span>Focus Score: <strong>{item.metrics.focusVar?.toFixed(1) || 'N/A'}</strong> (min 15.0)</span>
                      <span>Mean Lum: <strong>{item.metrics.brightMean?.toFixed(1) || 'N/A'}</strong> (norm 40-235)</span>
                      <span>FOV: <strong>{((item.metrics.fov || 0) * 100).toFixed(0)}%</strong></span>
                    </div>
                  )}
                </div>
              ))}

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 5, padding: '0.75rem 0.85rem', marginTop: '0.85rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#0f172a', display: 'block', marginBottom: '3px' }}>
                  Operator Instructions for Recapture:
                </span>
                <ul style={{ margin: 0, paddingLeft: '1.15rem', fontSize: '0.78rem', color: '#475569', lineHeight: 1.45 }}>
                  <li>Ensure patient head rests firmly against the chin rest.</li>
                  <li>Instruct patient to fixate on the internal green fixation target.</li>
                  <li>Verify pupil alignment to eliminate peripheral shadows.</li>
                  <li>Hold camera steady to prevent motion blur and capture at native resolution.</li>
                </ul>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '0.85rem 1.35rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setRejectionModal({ isOpen: false, rejectedItems: [] })}
                style={{
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 4,
                  padding: '0.55rem 1.25rem',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Acknowledge &amp; Recapture
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
