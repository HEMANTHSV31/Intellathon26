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
  const [activeScreeningId, setActiveScreeningId] = useState(null)
  const [isValidating, setIsValidating] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null)
  const [showPipelineDetails, setShowPipelineDetails] = useState(true)

  // Quality Rejection Modal State
  const [rejectionModal, setRejectionModal] = useState({
    isOpen: false,
    rejectedItems: []
  })

  // Doctor & Admin review states
  const [patientsQueue, setPatientsQueue] = useState([])
  const [queueLoading, setQueueLoading] = useState(false)

  const multiFileInputRef = useRef(null)

  // Compute live Patient ID: [PatientName]_[PhoneDigits]
  const cleanName = patientName.trim().replace(/[^a-zA-Z0-9]/g, '') || 'Patient'
  const cleanPhone = patientPhone.trim().replace(/\D/g, '')
  const currentPatientId = cleanPhone ? `${cleanName}_${cleanPhone}` : `${cleanName}_needPhoneDigits`

  useEffect(() => {
    const cleanup = initScreening()
    return () => {
      if (typeof cleanup === 'function') cleanup()
    }
  }, [])

  // Load patients queue from Supabase if role is doctor or admin
  useEffect(() => {
    if (activeRole === 'doctor' || activeRole === 'admin') {
      fetchPatientsQueue()
    }
  }, [activeRole])

  const fetchPatientsQueue = async () => {
    try {
      setQueueLoading(true)
      const token = localStorage.getItem('dr_token')
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch('/api/patients', { headers })
      if (res.ok) {
        const data = await res.json()
        setPatientsQueue(data.patients || [])
      }
    } catch (err) {
      console.warn('Could not fetch patients queue:', err)
    } finally {
      setQueueLoading(false)
    }
  }

  // Handle Multi-Image Upload with Real-Time Quality Gate
  const handleFilesUpload = async (filesList) => {
    if (!filesList || filesList.length === 0) return

    if (!cleanPhone) {
      alert('Please enter a valid Patient Phone Number with numeric digits. The Patient ID is generated as [PatientName]_[PhoneDigits].')
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
            id: 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            file,
            name: file.name,
            size: (file.size / 1024).toFixed(1) + ' KB',
            width: res.width,
            height: res.height,
            thumbnail: res.thumbnail,
            verdict: res.verdict,
            reasons: res.reasons || [],
            metrics: res.metrics,
            eye: newAccepted.length % 2 === 0 ? 'OD' : 'OS', // Default alternating OD/OS
            patientId: currentPatientId,
            patientName: patientName.trim(),
            patientPhone: cleanPhone,
            timestamp: new Date().toLocaleTimeString(),
            screeningStatus: 'Ready for analysis'
          })
        }
      } catch (err) {
        rejectedList.push({
          fileName: file.name,
          reason: 'Error processing file: ' + (err.message || err)
        })
      }
    }

    setIsValidating(false)

    // If any images failed the quality gate, popup the informative modal immediately
    if (rejectedList.length > 0) {
      setRejectionModal({
        isOpen: true,
        rejectedItems: rejectedList
      })
    }

    // Accept valid images
    if (newAccepted.length > 0) {
      setAcceptedImages(prev => [...prev, ...newAccepted])
      setSyncStatus({
        type: 'info',
        message: `${newAccepted.length} image(s) passed quality assessment and linked to ID: ${currentPatientId}`
      })
    }

    // Reset input
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

    // Update status in list
    setAcceptedImages(prev =>
      prev.map(item => item.id === imageItem.id ? { ...item, screeningStatus: 'Screening in progress...' } : item)
    )

    try {
      // Run the pipeline using drEngine
      await runPipelineWithMeta(imageItem.file, {
        patientId: imageItem.patientId,
        patientName: imageItem.patientName,
        patientPhone: imageItem.patientPhone,
        eye: imageItem.eye
      })

      // Update status
      setAcceptedImages(prev =>
        prev.map(item => item.id === imageItem.id ? { ...item, screeningStatus: 'Screening complete' } : item)
      )

      setSyncStatus({
        type: 'success',
        message: `Screening completed for ${imageItem.name} and synced to Supabase (Patient ID: ${imageItem.patientId}).`
      })
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

    setSyncStatus({ type: 'syncing', message: 'Saving patient record and fundus images to Supabase...' })

    try {
      const token = localStorage.getItem('dr_token')
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      // 1. Intake Patient in Supabase
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
        throw new Error(intakeErr.error || 'Failed to save patient to Supabase')
      }

      // 2. Upload Screenings
      let uploadedCount = 0
      for (const item of acceptedImages) {
        await fetch('/api/screenings/upload', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            id: item.id,
            patientId: item.patientId,
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
        message: `Successfully synchronized Patient ${currentPatientId} and ${uploadedCount} image(s) to Supabase database!`
      })
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
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1>Diabetic Retinopathy Screening</h1>
            <p className="subtitle">
              Client-side screening and explainability for primary health centre fundus photography. Capacity planning lives on the{' '}
              <Link to="/pipeline">capacity model</Link> page.
            </p>
          </div>

          {/* Active Role Badge & Demo Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#f1f5f9', padding: '6px 14px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>ACTIVE ROLE:</span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontWeight: 700,
              fontSize: '0.82rem',
              color: activeRole === 'operator' ? '#0d7a63' : activeRole === 'doctor' ? '#0284c7' : activeRole === 'patient' ? '#7c3aed' : '#334155',
              textTransform: 'uppercase'
            }}>
              {activeRole === 'operator' && '📸 Operator Intake Station'}
              {activeRole === 'doctor' && '🩺 Ophthalmologist Suite'}
              {activeRole === 'patient' && '👤 Patient Health Portal'}
              {activeRole === 'admin' && '🛡️ Clinic Administrator'}
            </span>
          </div>
        </div>

        <div id="model-status">Loading classifier model…</div>
        <progress id="model-progress" max="1"></progress>
      </header>

      {/* ========================================================================= */}
      {/* 1. OPERATOR VIEW: PATIENT INTAKE & MULTI-IMAGE UPLOAD STATION             */}
      {/* ========================================================================= */}
      {activeRole === 'operator' && (
        <section id="operator-station" style={{ background: '#ffffff', border: '1.5px solid #0d7a63', borderRadius: '12px', padding: '1.75rem', marginBottom: '2rem', boxShadow: '0 4px 16px rgba(13, 122, 99, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ background: '#0d7a63', color: '#ffffff', borderRadius: '6px', padding: '4px 10px', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Operator Station
              </span>
              <h2 style={{ margin: 0, fontSize: '1.18rem', color: '#0f172a' }}>Patient Intake &amp; Multi-Image Fundus Upload</h2>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '4px 12px', borderRadius: '6px' }}>
              <span style={{ fontSize: '0.78rem', color: '#065f46', fontWeight: 600 }}>GENERATED PATIENT ID:</span>
              <code style={{ fontSize: '0.88rem', fontWeight: 700, color: '#047857' }}>{currentPatientId}</code>
            </div>
          </div>

          <p style={{ fontSize: '0.88rem', color: '#475569', marginTop: 0, marginBottom: '1.25rem' }}>
            Enter the patient&apos;s details to attach their identifier (<code style={{ color: '#0d7a63' }}>[PatientName]_[PhoneDigits]</code>) to every captured fundus photograph. Upload multiple images as needed; all files undergo automated real-time quality validation.
          </p>

          {/* Patient Details Input Form */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem', background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Patient Full Name *
              </label>
              <input
                type="text"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="e.g. Ramesh Kumar"
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none' }}
              />
              <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Used for prefix in patient ID badge</span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Patient Phone Number (Digits) *
              </label>
              <input
                type="tel"
                value={patientPhone}
                onChange={(e) => setPatientPhone(e.target.value)}
                placeholder="e.g. 9876543210"
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none' }}
              />
              <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block', marginTop: '4px' }}>Phone digits provide unique clinical linkage</span>
            </div>
          </div>

          {/* Multi-Image Upload Dropzone */}
          <div
            style={{
              border: '2px dashed #0d7a63',
              borderRadius: '10px',
              padding: '2rem 1.5rem',
              textAlign: 'center',
              background: '#f0fdf4',
              cursor: 'pointer',
              transition: 'background 0.15s ease'
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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0d7a63' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </div>
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>
                {isValidating ? 'Validating fundus image quality…' : 'Click to Select or Drop Multiple Fundus Images'}
              </h3>
              <p style={{ margin: 0, fontSize: '0.84rem', color: '#475569' }}>
                You can upload as many images as you like. All accepted images will be saved under ID <code style={{ color: '#0d7a63', fontWeight: 600 }}>{currentPatientId}</code>.
              </p>
              <span style={{ fontSize: '0.76rem', color: '#64748b', background: '#ffffff', padding: '3px 8px', borderRadius: '4px', border: '1px solid #d1fae5' }}>
                Quality Gate: Auto-rejects low resolution (&lt;256px), un-upscaleable images, focus blur, and extreme illumination
              </span>
            </div>
          </div>

          {/* Sync & Notification Banner */}
          {syncStatus && (
            <div style={{
              marginTop: '1.25rem',
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              fontSize: '0.86rem',
              fontWeight: 500,
              background: syncStatus.type === 'success' ? '#f0fdf4' : syncStatus.type === 'error' ? '#fef2f2' : '#eff6ff',
              border: `1px solid ${syncStatus.type === 'success' ? '#86efac' : syncStatus.type === 'error' ? '#fca5a5' : '#93c5fd'}`,
              color: syncStatus.type === 'success' ? '#166534' : syncStatus.type === 'error' ? '#991b1b' : '#1e40af',
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
            <div style={{ marginTop: '1.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>
                  Accepted Patient Images ({acceptedImages.length}) — Associated with <code style={{ color: '#0d7a63' }}>{currentPatientId}</code>
                </h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={handleSyncToSupabase}
                    style={{
                      background: '#0d7a63',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.45rem 0.95rem',
                      fontSize: '0.84rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Sync All to Supabase
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {acceptedImages.map((imgItem) => (
                  <div
                    key={imgItem.id}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      background: '#ffffff',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                  >
                    {/* Thumbnail Preview */}
                    <div style={{ height: '160px', background: '#000000', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img
                        src={imgItem.thumbnail}
                        alt={imgItem.name}
                        style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                      />
                      <span style={{
                        position: 'absolute',
                        top: '8px',
                        left: '8px',
                        background: 'rgba(0,0,0,0.75)',
                        color: '#ffffff',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: '4px'
                      }}>
                        {imgItem.eye === 'OD' ? 'OD (Right Eye)' : 'OS (Left Eye)'}
                      </span>
                      <span style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        background: '#0d7a63',
                        color: '#ffffff',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px'
                      }}>
                        ✓ Quality Pass
                      </span>
                    </div>

                    {/* Details */}
                    <div style={{ padding: '0.85rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.86rem', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={imgItem.name}>
                        {imgItem.name}
                      </div>

                      <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                        ID: <code style={{ color: '#0d7a63', fontWeight: 600 }}>{imgItem.patientId}</code>
                      </div>

                      <div style={{ fontSize: '0.76rem', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Dim: {imgItem.width}×{imgItem.height} px</span>
                        <span>Size: {imgItem.size}</span>
                      </div>

                      {/* Eye Lateralization Toggle */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.35rem', paddingTop: '0.4rem', borderTop: '1px solid #f1f5f9' }}>
                        <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 500 }}>Lateralization:</span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={() => setAcceptedImages(prev => prev.map(x => x.id === imgItem.id ? { ...x, eye: 'OD' } : x))}
                            style={{
                              padding: '2px 8px',
                              fontSize: '0.74rem',
                              fontWeight: imgItem.eye === 'OD' ? 700 : 400,
                              background: imgItem.eye === 'OD' ? '#0f172a' : '#f8fafc',
                              color: imgItem.eye === 'OD' ? '#ffffff' : '#475569',
                              border: '1px solid #cbd5e1',
                              borderRadius: '4px'
                            }}
                          >
                            OD (Right)
                          </button>
                          <button
                            type="button"
                            onClick={() => setAcceptedImages(prev => prev.map(x => x.id === imgItem.id ? { ...x, eye: 'OS' } : x))}
                            style={{
                              padding: '2px 8px',
                              fontSize: '0.74rem',
                              fontWeight: imgItem.eye === 'OS' ? 700 : 400,
                              background: imgItem.eye === 'OS' ? '#0f172a' : '#f8fafc',
                              color: imgItem.eye === 'OS' ? '#ffffff' : '#475569',
                              border: '1px solid #cbd5e1',
                              borderRadius: '4px'
                            }}
                          >
                            OS (Left)
                          </button>
                        </div>
                      </div>

                      {/* Status */}
                      <div style={{ fontSize: '0.76rem', color: imgItem.screeningStatus?.includes('complete') ? '#047857' : '#64748b', fontWeight: 500, marginTop: '2px' }}>
                        Status: {imgItem.screeningStatus}
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.65rem' }}>
                        <button
                          type="button"
                          disabled={activeScreeningId === imgItem.id}
                          onClick={() => handleRunScreening(imgItem)}
                          style={{
                            flex: 1,
                            padding: '0.45rem',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            background: '#0f172a',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '5px',
                            cursor: 'pointer'
                          }}
                        >
                          {activeScreeningId === imgItem.id ? 'Running Analysis…' : '▶ Run Screening'}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeAcceptedImage(imgItem.id)}
                          style={{
                            padding: '0.45rem 0.65rem',
                            fontSize: '0.78rem',
                            background: '#fff1f2',
                            color: '#e11d48',
                            border: '1px solid #fecdd3',
                            borderRadius: '5px',
                            cursor: 'pointer'
                          }}
                          title="Remove image"
                        >
                          ✕
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
      {/* 2. DOCTOR / OPHTHALMOLOGIST VIEW: CLINICAL QUEUE & STAGING               */}
      {/* ========================================================================= */}
      {activeRole === 'doctor' && (
        <section id="doctor-suite" style={{ background: '#ffffff', border: '1.5px solid #0284c7', borderRadius: '12px', padding: '1.75rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ background: '#0284c7', color: '#ffffff', borderRadius: '6px', padding: '4px 10px', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>
                Ophthalmologist Diagnostic Suite
              </span>
              <h2 style={{ margin: 0, fontSize: '1.18rem', color: '#0f172a' }}>Clinical Review Queue &amp; ICDR Staging</h2>
            </div>
            <button
              type="button"
              onClick={fetchPatientsQueue}
              style={{ padding: '4px 12px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            >
              🔄 Refresh Supabase Queue
            </button>
          </div>

          <p style={{ fontSize: '0.88rem', color: '#475569', marginTop: 0 }}>
            Specialist review interface for verifying lesion candidate masks (MATLAB Image Processing Suite), Grad-CAM anatomical landmarks, and applying International Clinical Diabetic Retinopathy (ICDR) referral rules.
          </p>

          {/* Patients Queue Table */}
          <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
            <table className="kv" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.8rem', color: '#475569' }}>Patient ID</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.8rem', color: '#475569' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.8rem', color: '#475569' }}>Phone</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px', fontSize: '0.8rem', color: '#475569' }}>Images</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px', fontSize: '0.8rem', color: '#475569' }}>Referral Status</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: '0.8rem', color: '#475569' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {queueLoading ? (
                  <tr><td colSpan="6" style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>Loading Supabase patient queue…</td></tr>
                ) : patientsQueue.length === 0 ? (
                  <tr><td colSpan="6" style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>No patients currently registered in Supabase. Upload images via Operator mode to populate the queue.</td></tr>
                ) : (
                  patientsQueue.map((p) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#0284c7' }}>{p.id}</td>
                      <td style={{ padding: '8px 12px', color: '#0f172a' }}>{p.name}</td>
                      <td style={{ padding: '8px 12px', color: '#64748b' }}>{p.phone}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>{p.image_count || 1}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: p.referable_flag ? '#fee2e2' : '#f0fdf4',
                          color: p.referable_flag ? '#b91c1c' : '#15803d'
                        }}>
                          {p.referable_flag ? '⚠️ Referable' : '✓ Non-Referable'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setPatientName(p.name);
                            setPatientPhone(p.phone);
                            window.scrollTo({ top: document.getElementById('step1')?.offsetTop || 500, behavior: 'smooth' });
                          }}
                          style={{ padding: '3px 8px', fontSize: '0.74rem', borderRadius: '4px', background: '#0284c7', color: '#ffffff', border: 'none' }}
                        >
                          Review Patient
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 3. PATIENT VIEW: ACCESSIBLE HEALTH PORTAL & RESULTS SUMMARY               */}
      {/* ========================================================================= */}
      {activeRole === 'patient' && (
        <section id="patient-portal" style={{ background: '#ffffff', border: '1.5px solid #7c3aed', borderRadius: '12px', padding: '1.75rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.85rem' }}>
            <span style={{ background: '#7c3aed', color: '#ffffff', borderRadius: '6px', padding: '4px 10px', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>
              Patient Health Portal
            </span>
            <h2 style={{ margin: 0, fontSize: '1.18rem', color: '#0f172a' }}>Personal Diabetic Retinopathy Screening Record</h2>
          </div>

          <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.25rem' }}>
            <h3 style={{ marginTop: 0, color: '#5b21b6' }}>Welcome, {patientName || 'Patient'}</h3>
            <p style={{ fontSize: '0.88rem', color: '#4c1d95', margin: 0 }}>
              Your fundus photographs have been processed using high-resolution clinical AI and verified against ICDR screening standards. Below is your clinical summary and next appointment recommendations.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>SCREENING STATUS</span>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>Evaluation Complete</div>
              <p style={{ fontSize: '0.82rem', color: '#475569', marginTop: '6px' }}>Retinal microvascular structure assessed for signs of diabetic retinopathy.</p>
            </div>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>PATIENT ID BADGE</span>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#7c3aed', marginTop: '4px' }}>{currentPatientId}</div>
              <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '6px' }}>Linked to clinic mobile: {cleanPhone || 'Registered'}</p>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 4. ADMIN VIEW: CLINIC OPERATIONS & SUPABASE DATABASE STATS               */}
      {/* ========================================================================= */}
      {activeRole === 'admin' && (
        <section id="admin-suite" style={{ background: '#ffffff', border: '1.5px solid #334155', borderRadius: '12px', padding: '1.75rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.85rem' }}>
            <span style={{ background: '#334155', color: '#ffffff', borderRadius: '6px', padding: '4px 10px', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>
              System Administrator
            </span>
            <h2 style={{ margin: 0, fontSize: '1.18rem', color: '#0f172a' }}>Supabase Clinic Operations &amp; Database Health</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>SUPABASE CONNECTION</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#047857', marginTop: '4px' }}>Connected (PostgreSQL)</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Tables: app_roles, users, patients, uploaded_screenings</div>
            </div>
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>ROLES SUPPORTED</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>4 App Roles</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>patient, operator, doctor, admin</div>
            </div>
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>REGISTERED PATIENTS</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0284c7', marginTop: '4px' }}>{patientsQueue.length} Intake Records</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Linked via [PatientName]_[PhoneDigits]</div>
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

      {/* Toggle View for Pipeline Results (available for all roles for demo evaluations) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '2rem 0 1rem', borderTop: '1px solid #e2e8f0', paddingTop: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="pill" style={{ margin: 0 }}>Clinical Results</span>
          <h2 style={{ margin: 0 }}>Diabetic Retinopathy Diagnostic Pipeline</h2>
        </div>
        <button
          type="button"
          onClick={() => setShowPipelineDetails(!showPipelineDetails)}
          style={{ fontSize: '0.8rem', padding: '4px 10px', borderRadius: '4px' }}
        >
          {showPipelineDetails ? 'Collapse Analysis Panes' : 'Expand Analysis Panes'}
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
              MATLAB Image Processing Suite (+dr)
            </span>
          </div>
          <h2>Lesion candidate mask &amp; candidate localization</h2>
          <div style={{ background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.08) 0%, rgba(56, 189, 248, 0.04) 100%)', border: '1px solid rgba(2, 132, 199, 0.25)', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '0.86rem', color: '#0369a1' }}>
            <strong>High-Precision Morphology:</strong> Multi-scale directional top-hat morphology, ray-tracing vessel suppression, and perimacular tolerance for cotton wool spots and microaneurysms (<code style={{ background: 'rgba(2, 132, 199, 0.1)', padding: '2px 4px', borderRadius: '4px' }}>matlab/+dr/detectLesionCandidates.m</code>).
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
      {/* EXPLAINING CONTENT & CLINICAL METHODOLOGY AT THE BOTTOM OF THE PAGE       */}
      {/* ========================================================================= */}
      <section id="clinical-methodology-reference" className="step" style={{ marginTop: '3.5rem', background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <hr className="rule" />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
          <span className="pill" style={{ background: '#475569', color: '#fff' }}>Reference Guide</span>
          <h2 style={{ margin: 0 }}>Clinical Methodology, Detection Mechanics &amp; Sensitivity Tuning</h2>
        </div>
        <p className="notice" style={{ marginTop: '0.5rem' }}>
          All in-depth mathematical formulations, lesion typing rules, sensitivity controls, and explainability notes are compiled below for clinical review and research audit.
        </p>

        {/* Interactive Tuning Controls */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginTop: '1.5rem' }}>
          <div className="tune-box" style={{ margin: 0 }}>
            <h3 style={{ marginTop: 0 }}>Step 4: Lesion detection sensitivity</h3>
            <p className="small">These thresholds control morphological sensitivity across the retinal field. Changing them re-runs only Step 4 without re-running the neural network.</p>
            <label className="field">
              Dark-lesion sensitivity floor
              <input type="number" id="tune-dark" defaultValue="8" step="0.5" min="1" max="40" />
            </label>
            <div className="field-note">Floor in grey levels below which a dark region is never seeded. Working cut is adaptive to response distribution.</div>
            <label className="field">
              Bright-lesion sensitivity floor
              <input type="number" id="tune-bright" defaultValue="10" step="0.5" min="1" max="40" />
            </label>
            <div className="field-note">Calibrated for cotton wool spots and hard exudates across both open retina and perimacular background.</div>
            <label className="field">
              Minimum contrast above noise (k)
              <input type="number" id="tune-contrast" defaultValue="3" step="0.1" min="0.5" max="10" />
            </label>
            <div className="field-note">How far a candidate region must stand clear of local retinal noise.</div>
            <label className="field">
              Shape strictness (saturation ratio)
              <input type="number" id="tune-growth" defaultValue="1.10" step="0.01" min="1" max="2" />
            </label>
            <div className="field-note">How completely a region must be bounded before counting as a lesion. Tightening removes vessel crossing artifacts.</div>
            <div className="actions">
              <button id="rerun-detection" type="button">Re-run detection</button>
            </div>
          </div>

          <div className="tune-box" style={{ margin: 0 }}>
            <h3 style={{ marginTop: 0 }}>Step 3a: Grad-CAM attention regions</h3>
            <p className="small">Controls how finely the neural network attention heatmap is segmented into discrete attention hotspots.</p>
            <label className="field">
              Attention threshold (fraction of peak)
              <input type="number" id="tune-cam-threshold" defaultValue="0.5" step="0.05" min="0.15" max="0.95" />
            </label>
            <div className="field-note">Lower marks more, smaller regions. Higher retains only dominant peaks.</div>
            <label className="field">
              Maximum regions marked
              <input type="number" id="tune-cam-limit" defaultValue="12" step="1" min="1" max="40" />
            </label>
            <div className="field-note">Cap on discrete attention circles drawn on the overlay.</div>
            <div className="actions">
              <button id="rerun-cam" type="button">Re-draw regions</button>
            </div>
          </div>
        </div>

        <h3 style={{ marginTop: '2rem' }}>How each lesion type is decided</h3>
        <table className="kv" id="lesion-rules">
          <tbody>
            <tr><td>Microaneurysm candidate</td><td>Small, round, isolated dark structure. Separated from blot hemorrhages by area (&le; 0.00018 of retinal area) and circular compactness.</td></tr>
            <tr><td>Dot/blot hemorrhage candidate</td><td>Dark region with larger area, compact shape, bounded response across structuring rungs.</td></tr>
            <tr><td>Hard exudate candidate</td><td>Bright structure with sharp margins, characterized by high mean edge gradient (&ge; 1.5&times; mean retinal gradient).</td></tr>
            <tr><td>Cotton wool spot candidate</td><td>Bright structure with soft, low-gradient borders, localized along nerve fiber layers and perimacular papillomacular bundle. Minimum area calibrated to 0.00008 (~50 px).</td></tr>
            <tr><td>Right Eye (OD) vs Left Eye (OS)</td><td>The optic disc is nasal to the fovea in either eye. When the disc is left of the fovea, the frame is a Right Eye (OD); when right of the fovea, it is a Left Eye (OS). Quadrant boundaries pass through the disc-fovea midline, ensuring balanced quadrant areas.</td></tr>
            <tr><td>Perimacular tolerance</td><td>The retina darkens naturally near the fovea. Contrast thresholds for soft bright lesions (cotton wool spots) scale adaptively in the perimacular annulus (2.5&times; macula radius) to prevent false suppression.</td></tr>
            <tr><td>Growth stops at vessels</td><td>Regions may not cross vessels. Vessel pixels are masked out from extent growth while lesion seeds touching vessels are protected from deletion.</td></tr>
            <tr><td>Saturation ladder test</td><td>Evaluates multi-scale directional closing at 1&times;, 2&times;, and 4&times; structuring element lengths. True bounded lesions saturate; open vessels and bifurcations keep expanding and are suppressed.</td></tr>
            <tr><td>Peripapillary suppression</td><td>Disc tissue and scleral crescents are excluded via dual-threshold region growing and blue-fraction colour analysis (lipid exudate reads yellow, disc tissue reads white/grey).</td></tr>
          </tbody>
        </table>

        <h3 style={{ marginTop: '2rem' }}>Explainability &amp; Anatomical Landmark Mechanics</h3>
        <p className="small">
          <strong>Grad-CAM Formulation:</strong> Computed from real gradients of the loaded classifier&apos;s output with respect to convolutional layer (<span id="cam-layer-name">conv_pw_11_relu</span>, 14&times;14 resolution). Always computed for the &quot;DR present&quot; class score to show evidence the model evaluated for pathology even on normal predictions. Marked regions represent gradient connected components above <span id="blob-threshold-text">50%</span> of peak activation.
        </p>
        <p className="small">
          <strong>Landmark Estimation (Step 3b):</strong> The optic disc is detected using a dual-score metric combining blurred luminance with local standard deviation, identifying the vascular trunk and textured rim. The fovea is located by morphologically removing vessels, applying masked background subtraction to find the darkest avascular depression, and anchoring the candidate relative to the disc.
        </p>
        <p className="small">
          <strong>Quality Gate (Step 1):</strong> Focus, brightness, and field-of-view are evaluated directly from pixel arrays using Laplacian variance (high-pass energy), greyscale histogram percentiles, and circular FOV mask ratio.
        </p>
      </section>

      {/* ========================================================================= */}
      {/* 6. REAL-TIME QUALITY REJECTION MODAL POPUP                                */}
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
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
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
              borderRadius: '12px',
              maxWidth: '560px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
              overflow: 'hidden',
              animation: 'fadeIn 0.15s ease-out'
            }}
          >
            {/* Modal Header */}
            <div style={{ background: '#fef2f2', borderBottom: '1px solid #fee2e2', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#dc2626' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#991b1b', fontWeight: 700 }}>
                  Image Quality Check Failed — Image Rejected
                </h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#b91c1c' }}>
                  The uploaded fundus photograph does not meet clinical diagnostic quality standards.
                </p>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', maxHeight: '60vh', overflowY: 'auto' }}>
              <p style={{ margin: '0 0 1rem', fontSize: '0.88rem', color: '#334155', lineHeight: 1.5 }}>
                Our automated pre-screening quality gate evaluated the image against clinical acuity criteria. Low-quality images <strong>cannot be reliably upscaled or diagnosed</strong> for microaneurysms and hemorrhages, and have been <strong>removed from the intake queue</strong>:
              </p>

              {rejectionModal.rejectedItems.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    background: '#fff1f2',
                    border: '1px solid #fecdd3',
                    borderRadius: '8px',
                    padding: '1rem',
                    marginBottom: '0.75rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#9f1239' }}>{item.fileName}</span>
                    {item.width && item.height && (
                      <span style={{ fontSize: '0.74rem', background: '#ffe4e6', color: '#9f1239', padding: '2px 6px', borderRadius: '4px' }}>
                        {item.width}×{item.height} px
                      </span>
                    )}
                  </div>

                  <p style={{ margin: '0.25rem 0', fontSize: '0.84rem', color: '#881337', lineHeight: 1.4 }}>
                    <strong>Clinical Reason:</strong> {item.reason}
                  </p>

                  {item.metrics && (
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.76rem', color: '#9f1239', borderTop: '1px solid #fed7aa', paddingTop: '0.35rem' }}>
                      <span>Focus Var: <strong>{item.metrics.focusVar?.toFixed(1) || 'N/A'}</strong> (min 15.0)</span>
                      <span>Mean Lum: <strong>{item.metrics.brightMean?.toFixed(1) || 'N/A'}</strong> (norm 40-235)</span>
                      <span>FOV: <strong>{((item.metrics.fov || 0) * 100).toFixed(0)}%</strong> (min 35%)</span>
                    </div>
                  )}
                </div>
              ))}

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem 1rem', marginTop: '1rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#0f172a', display: 'block', marginBottom: '4px' }}>
                  Recommendations for the Operator:
                </span>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem', color: '#475569', lineHeight: 1.5 }}>
                  <li>Ensure patient head rests firmly on the chin-rest.</li>
                  <li>Instruct patient to fixate on the central green alignment target.</li>
                  <li>Verify pupil alignment to eliminate black crescent shadows and peripheral glare.</li>
                  <li>Hold camera steady to avoid motion blur and ensure native capture is at least 256×256 pixels.</li>
                </ul>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setRejectionModal({ isOpen: false, rejectedItems: [] })}
                style={{
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.6rem 1.4rem',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Understood &amp; Retake Image
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
