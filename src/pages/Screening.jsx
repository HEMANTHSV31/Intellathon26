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

  // Doctor Priority Queue & Severity Triage States
  const [doctorSeverityFilter, setDoctorSeverityFilter] = useState('ALL')
  const [doctorQueueMode, setDoctorQueueMode] = useState('pending') // 'pending' (active priority queue) or 'completed'
  const [completingPatientId, setCompletingPatientId] = useState(null)
  const [doctorReviewModal, setDoctorReviewModal] = useState({
    isOpen: false,
    patient: null,
    images: [],
    loading: false
  })

  // Admin Search & Archival States
  const [adminSearchQuery, setAdminSearchQuery] = useState('')
  const [adminSeverityFilter, setAdminSeverityFilter] = useState('ALL')
  const [adminStatusFilter, setAdminStatusFilter] = useState('ALL')
  const [adminRecords, setAdminRecords] = useState([])
  const [adminSearchLoading, setAdminSearchLoading] = useState(false)
  const [inspectModal, setInspectModal] = useState({
    isOpen: false,
    record: null
  })

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

  // Fetch live Supabase data on mount and whenever activeRole or filters change
  useEffect(() => {
    fetchLiveRoleData()
  }, [activeRole, user, doctorQueueMode, doctorSeverityFilter])

  // Fetch admin records when activeRole switches to admin
  useEffect(() => {
    if (activeRole === 'admin') {
      fetchAdminRecords()
    }
  }, [activeRole])

  const fetchLiveRoleData = async () => {
    setDataLoading(true)
    const token = localStorage.getItem('dr_token')
    const headers = token ? { Authorization: `Bearer ${token}` } : {}

    try {
      if (activeRole === 'doctor') {
        const queryParams = new URLSearchParams()
        if (doctorQueueMode !== 'all') queryParams.set('status', doctorQueueMode)
        if (doctorSeverityFilter !== 'ALL') queryParams.set('severity', doctorSeverityFilter)

        const [pRes, sRes] = await Promise.all([
          fetch(`/api/patients?${queryParams.toString()}`, { headers }),
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
        const pId = (user?.patientId || currentPatientId).toLowerCase()
        const res = await fetch(`/api/screenings?patientId=${encodeURIComponent(pId)}`, { headers })
        if (res.ok) {
          const data = await res.json()
          setPatientScreenings(data.screenings || [])
        }
      } else if (activeRole === 'admin') {
        const [statsRes, pRes, sRes] = await Promise.all([
          fetch('/api/stats', { headers }),
          fetch('/api/patients?status=all', { headers }),
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

  // Admin Backend-Based Search
  const fetchAdminRecords = async (query = adminSearchQuery, sev = adminSeverityFilter, stat = adminStatusFilter) => {
    setAdminSearchLoading(true)
    const token = localStorage.getItem('dr_token')
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    try {
      const qParams = new URLSearchParams()
      if (query && query.trim()) qParams.set('search', query.trim())
      if (sev && sev !== 'ALL') qParams.set('severity', sev)
      if (stat && stat !== 'ALL') qParams.set('status', stat)

      const res = await fetch(`/api/admin/records?${qParams.toString()}`, { headers })
      if (res.ok) {
        const data = await res.json()
        setAdminRecords(data.records || [])
      }
    } catch (err) {
      console.warn('Admin backend search error:', err)
    } finally {
      setAdminSearchLoading(false)
    }
  }

  // Doctor: Open Review Modal for Patient (Displays images, DR presence, DR softmax, lesion counts, severity)
  const handleOpenDoctorReview = async (patient) => {
    setDoctorReviewModal({
      isOpen: true,
      patient,
      images: [],
      loading: true
    })

    const token = localStorage.getItem('dr_token')
    const headers = token ? { Authorization: `Bearer ${token}` } : {}

    try {
      const res = await fetch(`/api/screenings?patientId=${encodeURIComponent(patient.id.toLowerCase())}`, { headers })
      if (res.ok) {
        const data = await res.json()
        setDoctorReviewModal({
          isOpen: true,
          patient,
          images: data.screenings || [],
          loading: false
        })
      } else {
        setDoctorReviewModal(prev => ({ ...prev, loading: false }))
      }
    } catch (err) {
      console.warn('Doctor review fetch error:', err)
      setDoctorReviewModal(prev => ({ ...prev, loading: false }))
    }
  }

  // Doctor: Mark Patient Review as Complete (removes from active priority queue)
  const handleMarkPatientComplete = async (patientId) => {
    if (!patientId) return
    setCompletingPatientId(patientId)
    const token = localStorage.getItem('dr_token')
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    try {
      const res = await fetch(`/api/patients/${encodeURIComponent(patientId.toLowerCase())}/complete`, {
        method: 'POST',
        headers
      })
      if (res.ok) {
        // If viewing active priority queue ('pending'), immediately remove from queue
        if (doctorQueueMode === 'pending') {
          setPatientsQueue(prev => prev.filter(p => p.id.toLowerCase() !== patientId.toLowerCase()))
        } else {
          setPatientsQueue(prev => prev.map(p => p.id.toLowerCase() === patientId.toLowerCase() ? { ...p, review_status: 'completed' } : p))
        }

        // Update modal state if open
        if (doctorReviewModal.isOpen && doctorReviewModal.patient?.id.toLowerCase() === patientId.toLowerCase()) {
          setDoctorReviewModal(prev => ({
            ...prev,
            patient: { ...prev.patient, review_status: 'completed' }
          }))
        }

        setSyncStatus({
          type: 'success',
          message: `Patient ${patientId} review marked as complete and removed from active priority queue.`
        })

        // Refresh live data in background
        fetchLiveRoleData()
      } else {
        const errData = await res.json()
        alert(errData.error || 'Failed to complete patient review.')
      }
    } catch (err) {
      console.error('Mark patient complete error:', err)
      alert('Error updating patient status: ' + (err.message || err))
    } finally {
      setCompletingPatientId(null)
    }
  }

  // Handle Multi-Image Upload with Real-Time Quality Gate & Automated Backend Screening
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
    const token = localStorage.getItem('dr_token')
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

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
          const imgId = 'scr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)
          const eye = (acceptedImages.length + newAccepted.length) % 2 === 0 ? 'OD' : 'OS'
          const itemObj = {
            id: imgId,
            file,
            name: file.name,
            size: (file.size / 1024).toFixed(1) + ' KB',
            width: res.width,
            height: res.height,
            thumbnail: res.thumbnail,
            verdict: res.verdict,
            reasons: res.reasons || [],
            metrics: res.metrics,
            eye,
            patientId: currentPatientId.toLowerCase(),
            patientName: patientName.trim(),
            patientPhone: cleanPhone,
            timestamp: new Date().toLocaleTimeString(),
            screeningStatus: 'Running automated screening in backend service…',
            prediction: 'Analyzing on server…',
            drSoftmax: null,
            severityLevel: 'PENDING',
            lesionCounts: null,
            icdrGrade: null,
            referable: false
          }
          newAccepted.push(itemObj)

          // Run Automated Screening on the Backend Service
          fetch('/api/screenings/upload', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              id: imgId,
              patientId: currentPatientId.toLowerCase(),
              patientName: patientName.trim(),
              patientPhone: cleanPhone,
              eye,
              fileName: file.name,
              imageData: res.thumbnail,
              qualityVerdict: res.verdict,
              timestamp: Date.now()
            })
          })
          .then(async (upRes) => {
            if (upRes.ok) {
              const upData = await upRes.json()
              const analysis = upData.analysis || {}
              setAcceptedImages(prev => prev.map(img => {
                if (img.id === imgId) {
                  return {
                    ...img,
                    screeningStatus: 'Backend Screening Complete',
                    prediction: analysis.prediction || 'Screening Complete',
                    drSoftmax: analysis.drSoftmax,
                    severityLevel: analysis.severityLevel || 'LOW',
                    icdrGrade: analysis.icdrGrade,
                    lesionCounts: analysis.lesionCounts,
                    referable: analysis.referable
                  }
                }
                return img
              }))
              // Auto-refresh doctor priority queue and admin stats
              fetchLiveRoleData()
            }
          })
          .catch(err => {
            console.warn('Backend screening upload notice:', err)
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
        message: `${newAccepted.length} image(s) passed quality gate and submitted to backend screening engine. Quality passed count: ${sessionQualityPassedCount + newAccepted.length}`
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

                      {/* Automated Backend Screening Live Results */}
                      {imgItem.drSoftmax !== null && imgItem.drSoftmax !== undefined ? (
                        <div style={{ marginTop: '0.45rem', padding: '0.55rem', background: '#f8fafc', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: '0.74rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{
                              fontWeight: 700,
                              color: imgItem.referable ? '#b91c1c' : '#15803d',
                              background: imgItem.referable ? '#fef2f2' : '#f0fdf4',
                              padding: '1px 6px',
                              borderRadius: 3,
                              border: `1px solid ${imgItem.referable ? '#fca5a5' : '#bbf7d0'}`
                            }}>
                              {imgItem.prediction}
                            </span>
                            <span style={{
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: 3,
                              fontSize: '0.7rem',
                              background: imgItem.severityLevel === 'HIGH' ? '#fef2f2' : imgItem.severityLevel === 'MEDIUM' ? '#fffbeb' : '#f0fdf4',
                              color: imgItem.severityLevel === 'HIGH' ? '#b91c1c' : imgItem.severityLevel === 'MEDIUM' ? '#b45309' : '#15803d',
                              border: `1px solid ${imgItem.severityLevel === 'HIGH' ? '#fca5a5' : imgItem.severityLevel === 'MEDIUM' ? '#fcd34d' : '#86efac'}`
                            }}>
                              {imgItem.severityLevel} SEVERITY
                            </span>
                          </div>
                          <div style={{ color: '#334155', display: 'flex', justifyContent: 'space-between', marginTop: '3px', fontSize: '0.73rem' }}>
                            <span>DR Softmax: <strong>{(imgItem.drSoftmax * 100).toFixed(1)}%</strong></span>
                            <span>Grade: <strong>{imgItem.icdrGrade || 'Evaluated'}</strong></span>
                          </div>
                          {imgItem.lesionCounts && (
                            <div style={{ color: '#64748b', fontSize: '0.7rem', marginTop: '4px', borderTop: '1px solid #e2e8f0', paddingTop: '3px' }}>
                              Lesions: MA: {imgItem.lesionCounts.microaneurysms ?? imgItem.lesionCounts.MA ?? 0} • HEM: {imgItem.lesionCounts.hemorrhages ?? imgItem.lesionCounts.HEM ?? 0} • HE: {imgItem.lesionCounts.hardExudates ?? imgItem.lesionCounts.HE ?? 0} • CWS: {imgItem.lesionCounts.cottonWoolSpots ?? imgItem.lesionCounts.CWS ?? 0}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '2px', fontStyle: 'italic' }}>
                          Status: <span style={{ fontWeight: 500 }}>{imgItem.screeningStatus}</span>
                        </div>
                      )}

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
                          {activeScreeningId === imgItem.id ? 'Analyzing…' : 'Inspect Pipeline'}
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
              <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 600 }}>
                Ophthalmologist Diagnostic Review &amp; Priority Triage Queue
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                Priority triage hierarchy: <strong>HIGH severity cases lead</strong>, followed by <strong>MEDIUM</strong> and <strong>LOW</strong>.
              </span>
            </div>
            <button
              type="button"
              onClick={fetchLiveRoleData}
              disabled={dataLoading}
              style={{ padding: '4px 10px', fontSize: '0.78rem', borderRadius: 4, border: '1px solid #cbd5e1', background: '#ffffff', cursor: 'pointer', fontWeight: 500 }}
            >
              {dataLoading ? 'Refreshing…' : 'Refresh Live Database'}
            </button>
          </div>

          {/* Queue View Selector & Severity Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.85rem', marginBottom: '1.25rem' }}>
            {/* Active Queue vs Completed Cases Mode */}
            <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: 5 }}>
              <button
                type="button"
                onClick={() => setDoctorQueueMode('pending')}
                style={{
                  padding: '4px 12px',
                  fontSize: '0.78rem',
                  fontWeight: doctorQueueMode === 'pending' ? 600 : 500,
                  background: doctorQueueMode === 'pending' ? '#ffffff' : 'transparent',
                  color: doctorQueueMode === 'pending' ? '#0f172a' : '#64748b',
                  border: doctorQueueMode === 'pending' ? '1px solid #cbd5e1' : 'none',
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                ● Active Priority Queue ({doctorQueueMode === 'pending' ? patientsQueue.length : 'Active'})
              </button>
              <button
                type="button"
                onClick={() => setDoctorQueueMode('completed')}
                style={{
                  padding: '4px 12px',
                  fontSize: '0.78rem',
                  fontWeight: doctorQueueMode === 'completed' ? 600 : 500,
                  background: doctorQueueMode === 'completed' ? '#ffffff' : 'transparent',
                  color: doctorQueueMode === 'completed' ? '#0f172a' : '#64748b',
                  border: doctorQueueMode === 'completed' ? '1px solid #cbd5e1' : 'none',
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                ✓ Completed Reviews ({doctorQueueMode === 'completed' ? patientsQueue.length : 'Archived'})
              </button>
            </div>

            {/* Severity Triage Filter Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>Triage Filter:</span>
              {['ALL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => {
                const isSelected = doctorSeverityFilter === sev
                let bg = isSelected ? '#0f172a' : '#f8fafc'
                let color = isSelected ? '#ffffff' : '#475569'
                let border = isSelected ? '#0f172a' : '#cbd5e1'
                if (!isSelected) {
                  if (sev === 'HIGH') { color = '#b91c1c'; border = '#fca5a5'; bg = '#fef2f2' }
                  else if (sev === 'MEDIUM') { color = '#b45309'; border = '#fcd34d'; bg = '#fffbeb' }
                  else if (sev === 'LOW') { color = '#15803d'; border = '#86efac'; bg = '#f0fdf4' }
                }
                return (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setDoctorSeverityFilter(sev)}
                    style={{
                      padding: '2px 8px',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      background: bg,
                      color: color,
                      border: `1px solid ${border}`,
                      borderRadius: 4,
                      cursor: 'pointer'
                    }}
                  >
                    {sev === 'HIGH' && '🔴 '}
                    {sev === 'MEDIUM' && '🟡 '}
                    {sev === 'LOW' && '🟢 '}
                    {sev === 'ALL' ? 'All Tiers' : `${sev}`}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Live Patients Queue Table */}
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 5 }}>
            <table className="kv" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '8px 10px', color: '#475569' }}>Triage Severity</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', color: '#475569' }}>Patient ID</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', color: '#475569' }}>Name &amp; Phone</th>
                  <th style={{ textAlign: 'center', padding: '8px 10px', color: '#475569' }}>Captures</th>
                  <th style={{ textAlign: 'center', padding: '8px 10px', color: '#475569' }}>DR Softmax</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', color: '#475569' }}>Primary Diagnosis</th>
                  <th style={{ textAlign: 'center', padding: '8px 10px', color: '#475569' }}>Review Status</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px', color: '#475569', minWidth: '190px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {dataLoading ? (
                  <tr><td colSpan="8" style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>Loading priority triage records from Supabase…</td></tr>
                ) : patientsQueue.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                      {doctorQueueMode === 'pending'
                        ? 'No pending patients in active priority queue. All screened patients have been reviewed!'
                        : 'No completed patient reviews found.'}
                    </td>
                  </tr>
                ) : (
                  patientsQueue.map((p) => {
                    const sev = (p.severity_level || 'LOW').toUpperCase()
                    const isCompleted = p.review_status === 'completed'
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', background: sev === 'HIGH' && !isCompleted ? '#fffdfd' : 'transparent' }}>
                        {/* Triage Severity Badge */}
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontWeight: 700,
                            fontSize: '0.72rem',
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: sev === 'HIGH' ? '#fef2f2' : sev === 'MEDIUM' ? '#fffbeb' : '#f0fdf4',
                            color: sev === 'HIGH' ? '#b91c1c' : sev === 'MEDIUM' ? '#b45309' : '#15803d',
                            border: `1px solid ${sev === 'HIGH' ? '#fca5a5' : sev === 'MEDIUM' ? '#fcd34d' : '#86efac'}`
                          }}>
                            {sev === 'HIGH' ? '● HIGH' : sev === 'MEDIUM' ? '● MEDIUM' : '● LOW'}
                          </span>
                        </td>

                        {/* Patient ID */}
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: '#0f766e' }}>
                          <code>{p.id.toLowerCase()}</code>
                        </td>

                        {/* Name & Phone */}
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{p.name}</div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{p.phone}</div>
                        </td>

                        {/* Captures */}
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <span style={{ fontWeight: 600 }}>{p.total_image_count || 1}</span>
                          <span style={{ fontSize: '0.72rem', color: '#15803d', display: 'block' }}>
                            ({p.quality_passed_count !== undefined ? p.quality_passed_count : (p.total_image_count || 1)} passed)
                          </span>
                        </td>

                        {/* DR Softmax Score */}
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          {p.max_dr_softmax !== null && p.max_dr_softmax !== undefined ? (
                            <span style={{ fontWeight: 700, color: p.max_dr_softmax >= 0.7 ? '#b91c1c' : p.max_dr_softmax >= 0.4 ? '#b45309' : '#15803d' }}>
                              {(p.max_dr_softmax * 100).toFixed(1)}%
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>—</span>
                          )}
                        </td>

                        {/* Primary Diagnosis & ICDR Grade */}
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            padding: '1px 6px',
                            borderRadius: 3,
                            background: p.referable_flag ? '#fef2f2' : '#f0fdf4',
                            color: p.referable_flag ? '#b91c1c' : '#15803d',
                            border: `1px solid ${p.referable_flag ? '#fca5a5' : '#bbf7d0'}`
                          }}>
                            {p.referable_flag ? 'DR Present' : 'No DR Detected'}
                          </span>
                          <span style={{ fontSize: '0.73rem', color: '#475569', display: 'block', marginTop: '2px' }}>
                            {p.primary_icdr_grade || 'ICDR Staged'}
                          </span>
                        </td>

                        {/* Review Status */}
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            padding: '1px 6px',
                            borderRadius: 3,
                            background: isCompleted ? '#f0fdf4' : '#fffbeb',
                            color: isCompleted ? '#166534' : '#b45309',
                            border: `1px solid ${isCompleted ? '#86efac' : '#fcd34d'}`
                          }}>
                            {isCompleted ? '✓ Completed' : 'Pending Review'}
                          </span>
                        </td>

                        {/* Action Buttons: Review & Mark as Complete */}
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleOpenDoctorReview(p)}
                              style={{
                                padding: '3px 10px',
                                fontSize: '0.76rem',
                                borderRadius: 4,
                                background: '#0f172a',
                                color: '#ffffff',
                                border: 'none',
                                cursor: 'pointer',
                                fontWeight: 600
                              }}
                              title="Review fundus photographs and clinical diagnostic breakdown"
                            >
                              Review
                            </button>

                            {/* Mark as Complete button (removes from active queue) */}
                            {!isCompleted ? (
                              <button
                                type="button"
                                disabled={completingPatientId === p.id}
                                onClick={() => handleMarkPatientComplete(p.id)}
                                style={{
                                  padding: '3px 10px',
                                  fontSize: '0.76rem',
                                  borderRadius: 4,
                                  background: '#15803d',
                                  color: '#ffffff',
                                  border: '1px solid #166534',
                                  cursor: completingPatientId === p.id ? 'not-allowed' : 'pointer',
                                  fontWeight: 600
                                }}
                                title="Mark as complete and remove from active priority queue"
                              >
                                {completingPatientId === p.id ? 'Saving…' : 'Mark Complete'}
                              </button>
                            ) : (
                              <span style={{ fontSize: '0.72rem', color: '#166534', fontWeight: 600, padding: '3px 6px' }}>
                                Done
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Archived Fundus Photographs & Diagnostics */}
          <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: '#334155', margin: '1.5rem 0 0.5rem 0' }}>
            Archived Fundus Photographs &amp; Automated Diagnostics ({screeningsList.length})
          </h3>
          {screeningsList.length === 0 ? (
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: 5, border: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.82rem', textAlign: 'center' }}>
              No individual screening photographs recorded in database yet.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.85rem' }}>
              {screeningsList.map((scr) => {
                const sSev = (scr.severity_level || 'LOW').toUpperCase()
                return (
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
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '2px' }}>
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: 3,
                          background: sSev === 'HIGH' ? '#fef2f2' : sSev === 'MEDIUM' ? '#fffbeb' : '#f0fdf4',
                          color: sSev === 'HIGH' ? '#b91c1c' : sSev === 'MEDIUM' ? '#b45309' : '#15803d',
                          border: `1px solid ${sSev === 'HIGH' ? '#fca5a5' : sSev === 'MEDIUM' ? '#fcd34d' : '#86efac'}`
                        }}>
                          {sSev}
                        </span>
                        {scr.dr_softmax !== null && scr.dr_softmax !== undefined && (
                          <span style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 600 }}>
                            Softmax: {(scr.dr_softmax * 100).toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: scr.referable ? '#b91c1c' : '#15803d', fontWeight: 600, marginTop: '2px' }}>
                        {scr.prediction || 'Evaluated'}
                      </div>
                    </div>
                  </div>
                )
              })}
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
      {/* 4. ADMIN VIEW: LIVE CLINIC TELEMETRY & BACKEND RECORDS SEARCH             */}
      {/* ========================================================================= */}
      {activeRole === 'admin' && (
        <section id="admin-suite" style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 600 }}>
                Clinic Operations &amp; Master Archival Registry
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                Complete administrative control with backend-powered multi-field searching across all screening records.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                fetchLiveRoleData()
                fetchAdminRecords()
              }}
              disabled={dataLoading || adminSearchLoading}
              style={{ padding: '4px 10px', fontSize: '0.78rem', borderRadius: 4, border: '1px solid #cbd5e1', background: '#ffffff', cursor: 'pointer', fontWeight: 500 }}
            >
              {dataLoading || adminSearchLoading ? 'Querying…' : 'Query Telemetry & Records'}
            </button>
          </div>

          {/* Telemetry KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem', marginBottom: '1.75rem' }}>
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

          {/* Backend-Based Archival Search Station */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '1.25rem', marginBottom: '1.25rem' }}>
            <div style={{ marginBottom: '0.85rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.96rem', color: '#0f172a', fontWeight: 600 }}>
                Backend Records Search &amp; Archival Explorer
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                Server-side SQL multi-field search across patient names, lowercase identifiers, phone numbers, image filenames, and ICDR diagnoses.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
              {/* Text Search Input */}
              <div style={{ gridColumn: 'span 2', minWidth: '260px' }}>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: '#334155', marginBottom: '3px' }}>
                  Search Query (Name, ID, Phone, File, Diagnosis)
                </label>
                <input
                  type="text"
                  value={adminSearchQuery}
                  onChange={(e) => setAdminSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      fetchAdminRecords(adminSearchQuery, adminSeverityFilter, adminStatusFilter)
                    }
                  }}
                  placeholder="e.g. Ramesh, 9876543210, fundus, Moderate NPDR…"
                  style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.84rem', background: '#ffffff', outline: 'none' }}
                />
              </div>

              {/* Severity Filter */}
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: '#334155', marginBottom: '3px' }}>
                  Severity Level
                </label>
                <select
                  value={adminSeverityFilter}
                  onChange={(e) => {
                    setAdminSeverityFilter(e.target.value)
                    fetchAdminRecords(adminSearchQuery, e.target.value, adminStatusFilter)
                  }}
                  style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.82rem', background: '#ffffff' }}
                >
                  <option value="ALL">All Severities</option>
                  <option value="HIGH">🔴 High Severity</option>
                  <option value="MEDIUM">🟡 Medium Severity</option>
                  <option value="LOW">🟢 Low Severity</option>
                </select>
              </div>

              {/* Review Status Filter */}
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: '#334155', marginBottom: '3px' }}>
                  Review Status
                </label>
                <select
                  value={adminStatusFilter}
                  onChange={(e) => {
                    setAdminStatusFilter(e.target.value)
                    fetchAdminRecords(adminSearchQuery, adminSeverityFilter, e.target.value)
                  }}
                  style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.82rem', background: '#ffffff' }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="pending">Pending Doctor Review</option>
                  <option value="completed">Completed Reviews</option>
                </select>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => fetchAdminRecords(adminSearchQuery, adminSeverityFilter, adminStatusFilter)}
                  disabled={adminSearchLoading}
                  style={{
                    flex: 1,
                    padding: '0.45rem 0.85rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    background: '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer'
                  }}
                >
                  {adminSearchLoading ? 'Searching…' : 'Search Records'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdminSearchQuery('')
                    setAdminSeverityFilter('ALL')
                    setAdminStatusFilter('ALL')
                    fetchAdminRecords('', 'ALL', 'ALL')
                  }}
                  style={{
                    padding: '0.45rem 0.65rem',
                    fontSize: '0.8rem',
                    background: '#ffffff',
                    color: '#475569',
                    border: '1px solid #cbd5e1',
                    borderRadius: 4,
                    cursor: 'pointer'
                  }}
                  title="Clear search filters"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Results Match Summary */}
            <div style={{ marginTop: '0.65rem', fontSize: '0.75rem', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                Matching Records: <strong>{adminRecords.length}</strong> {adminSearchQuery ? `for "${adminSearchQuery}"` : ''}
              </span>
              {adminSearchLoading && <span style={{ color: '#0f766e', fontWeight: 600 }}>Executing backend SQL query…</span>}
            </div>
          </div>

          {/* Master Screening Records Table */}
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 5 }}>
            <table className="kv" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'center', padding: '7px 8px', color: '#475569', width: '50px' }}>Capture</th>
                  <th style={{ textAlign: 'left', padding: '7px 10px', color: '#475569' }}>Patient ID</th>
                  <th style={{ textAlign: 'left', padding: '7px 10px', color: '#475569' }}>Name &amp; Contact</th>
                  <th style={{ textAlign: 'center', padding: '7px 8px', color: '#475569' }}>Eye</th>
                  <th style={{ textAlign: 'left', padding: '7px 10px', color: '#475569' }}>Diagnosis &amp; Softmax</th>
                  <th style={{ textAlign: 'center', padding: '7px 8px', color: '#475569' }}>Severity</th>
                  <th style={{ textAlign: 'left', padding: '7px 10px', color: '#475569' }}>Candidate Lesions</th>
                  <th style={{ textAlign: 'center', padding: '7px 8px', color: '#475569' }}>Status</th>
                  <th style={{ textAlign: 'right', padding: '7px 10px', color: '#475569' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {adminSearchLoading ? (
                  <tr><td colSpan="9" style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>Executing backend database search…</td></tr>
                ) : adminRecords.length === 0 ? (
                  <tr><td colSpan="9" style={{ padding: '18px', textAlign: 'center', color: '#64748b' }}>No screening records matched your backend search query.</td></tr>
                ) : (
                  adminRecords.map((rec) => {
                    const rSev = (rec.severity_level || 'LOW').toUpperCase()
                    const lCounts = typeof rec.lesion_counts === 'string' ? JSON.parse(rec.lesion_counts || '{}') : (rec.lesion_counts || {})
                    return (
                      <tr key={rec.screening_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        {/* Thumbnail */}
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          {rec.image_data ? (
                            <img
                              src={rec.image_data}
                              alt={rec.file_name}
                              style={{ width: '42px', height: '42px', objectFit: 'cover', borderRadius: 3, background: '#000000', cursor: 'pointer' }}
                              onClick={() => setInspectModal({ isOpen: true, record: rec })}
                              title="Click to inspect"
                            />
                          ) : (
                            <div style={{ width: '42px', height: '42px', background: '#f1f5f9', borderRadius: 3, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', color: '#94a3b8' }}>
                              No Pic
                            </div>
                          )}
                        </td>

                        {/* Patient ID */}
                        <td style={{ padding: '7px 10px', fontWeight: 600, color: '#0f766e' }}>
                          <code>{(rec.patient_id || 'unlinked').toLowerCase()}</code>
                        </td>

                        {/* Name & Contact */}
                        <td style={{ padding: '7px 10px' }}>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{rec.patient_name || 'Anonymous'}</div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{rec.patient_phone || 'No phone'}</div>
                        </td>

                        {/* Eye */}
                        <td style={{ padding: '7px 8px', textAlign: 'center', fontWeight: 600, color: '#475569' }}>
                          {rec.eye || 'OD'}
                        </td>

                        {/* Diagnosis & Softmax */}
                        <td style={{ padding: '7px 10px' }}>
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: 3,
                            background: rec.referable ? '#fef2f2' : '#f0fdf4',
                            color: rec.referable ? '#b91c1c' : '#15803d',
                            border: `1px solid ${rec.referable ? '#fca5a5' : '#bbf7d0'}`
                          }}>
                            {rec.prediction || (rec.referable ? 'DR Present' : 'No DR')}
                          </span>
                          <div style={{ fontSize: '0.71rem', color: '#475569', marginTop: '2px' }}>
                            Softmax: <strong>{rec.dr_softmax !== null && rec.dr_softmax !== undefined ? `${(rec.dr_softmax * 100).toFixed(1)}%` : 'N/A'}</strong> • {rec.icdr_grade || 'Evaluated'}
                          </div>
                        </td>

                        {/* Severity Badge */}
                        <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                          <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 3,
                            background: rSev === 'HIGH' ? '#fef2f2' : rSev === 'MEDIUM' ? '#fffbeb' : '#f0fdf4',
                            color: rSev === 'HIGH' ? '#b91c1c' : rSev === 'MEDIUM' ? '#b45309' : '#15803d',
                            border: `1px solid ${rSev === 'HIGH' ? '#fca5a5' : rSev === 'MEDIUM' ? '#fcd34d' : '#86efac'}`
                          }}>
                            {rSev}
                          </span>
                        </td>

                        {/* Candidate Lesions Breakdown */}
                        <td style={{ padding: '7px 10px', fontSize: '0.71rem', color: '#475569' }}>
                          <span>MA: <strong>{lCounts.microaneurysms ?? lCounts.MA ?? 0}</strong></span> •{' '}
                          <span>HEM: <strong>{lCounts.hemorrhages ?? lCounts.HEM ?? 0}</strong></span> •{' '}
                          <span>HE: <strong>{lCounts.hardExudates ?? lCounts.HE ?? 0}</strong></span> •{' '}
                          <span>CWS: <strong>{lCounts.cottonWoolSpots ?? lCounts.CWS ?? 0}</strong></span>
                        </td>

                        {/* Status */}
                        <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                          <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            padding: '1px 5px',
                            borderRadius: 3,
                            background: rec.review_status === 'completed' ? '#f0fdf4' : '#fffbeb',
                            color: rec.review_status === 'completed' ? '#166534' : '#b45309',
                            border: `1px solid ${rec.review_status === 'completed' ? '#86efac' : '#fcd34d'}`
                          }}>
                            {rec.review_status === 'completed' ? '✓ Completed' : 'Pending'}
                          </span>
                        </td>

                        {/* Action */}
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => setInspectModal({ isOpen: true, record: rec })}
                            style={{
                              padding: '2px 8px',
                              fontSize: '0.74rem',
                              background: '#0f172a',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: 3,
                              cursor: 'pointer'
                            }}
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
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

      {/* ========================================================================= */}
      {/* 8. DOCTOR CLINICAL REVIEW MODAL (IMAGES, DR PRESENCE, SOFTMAX, LESIONS)   */}
      {/* ========================================================================= */}
      {doctorReviewModal.isOpen && doctorReviewModal.patient && (
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
            zIndex: 9998,
            padding: '1.25rem'
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 8,
              maxWidth: '880px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '1.15rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 700 }}>
                    Patient Clinical Review — {doctorReviewModal.patient.name}
                  </h3>
                  <code style={{ fontSize: '0.84rem', color: '#0f766e', fontWeight: 700, background: '#f0fdf4', padding: '2px 6px', borderRadius: 3, border: '1px solid #bbf7d0' }}>
                    {doctorReviewModal.patient.id.toLowerCase()}
                  </code>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '3px' }}>
                  Contact: {doctorReviewModal.patient.phone} • Registered: {new Date(doctorReviewModal.patient.created_at || Date.now()).toLocaleDateString()}
                </div>
              </div>

              {/* Prominent Patient Severity & Review Status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {(() => {
                  const pSev = (doctorReviewModal.patient.severity_level || 'LOW').toUpperCase()
                  return (
                    <span style={{
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      padding: '4px 10px',
                      borderRadius: 4,
                      background: pSev === 'HIGH' ? '#fef2f2' : pSev === 'MEDIUM' ? '#fffbeb' : '#f0fdf4',
                      color: pSev === 'HIGH' ? '#b91c1c' : pSev === 'MEDIUM' ? '#b45309' : '#15803d',
                      border: `1px solid ${pSev === 'HIGH' ? '#fca5a5' : pSev === 'MEDIUM' ? '#fcd34d' : '#86efac'}`
                    }}>
                      ● {pSev} SEVERITY LEVEL
                    </span>
                  )
                })()}

                <span style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: 4,
                  background: doctorReviewModal.patient.review_status === 'completed' ? '#f0fdf4' : '#fffbeb',
                  color: doctorReviewModal.patient.review_status === 'completed' ? '#166534' : '#b45309',
                  border: `1px solid ${doctorReviewModal.patient.review_status === 'completed' ? '#86efac' : '#fcd34d'}`
                }}>
                  {doctorReviewModal.patient.review_status === 'completed' ? '✓ Review Completed' : 'Pending Review'}
                </span>
              </div>
            </div>

            {/* Modal Body: Fundus Photographs & Diagnostics */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.82rem', color: '#475569' }}>
                <strong>Automated Screening Results:</strong> Evaluated by backend screening service. Review the fundus photographs, DR presence outcome, DR Softmax probability, and morphological lesion candidate counts below.
              </div>

              {doctorReviewModal.loading ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                  Loading patient photographs and screening records from Supabase…
                </div>
              ) : doctorReviewModal.images.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: 6, border: '1px dashed #cbd5e1' }}>
                  No fundus photographs found for patient {doctorReviewModal.patient.id}.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {doctorReviewModal.images.map((img, idx) => {
                    const lCounts = typeof img.lesion_counts === 'string' ? JSON.parse(img.lesion_counts || '{}') : (img.lesion_counts || {})
                    const imgSev = (img.severity_level || doctorReviewModal.patient.severity_level || 'LOW').toUpperCase()
                    const softmaxVal = img.dr_softmax !== null && img.dr_softmax !== undefined ? img.dr_softmax : (img.dr_score || 0.5)
                    const isDrPresent = img.referable || softmaxVal >= 0.5 || img.prediction?.toLowerCase().includes('dr present') || img.prediction?.toLowerCase().includes('referable')

                    return (
                      <div
                        key={img.id || idx}
                        style={{
                          border: '1px solid #e2e8f0',
                          borderRadius: 6,
                          overflow: 'hidden',
                          background: '#ffffff',
                          display: 'grid',
                          gridTemplateColumns: 'minmax(180px, 240px) 1fr',
                          gap: '1.25rem'
                        }}
                      >
                        {/* Image Preview */}
                        <div style={{ background: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '180px', position: 'relative' }}>
                          {img.image_data ? (
                            <img
                              src={img.image_data}
                              alt={img.file_name}
                              style={{ maxHeight: '200px', maxWidth: '100%', objectFit: 'contain' }}
                            />
                          ) : (
                            <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>No image data</div>
                          )}
                          <span style={{
                            position: 'absolute',
                            top: '8px',
                            left: '8px',
                            background: 'rgba(0,0,0,0.85)',
                            color: '#ffffff',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 3
                          }}>
                            {img.eye === 'OD' ? 'OD (Right Eye)' : 'OS (Left Eye)'}
                          </span>
                        </div>

                        {/* Clinical Results & Lesions Breakdown */}
                        <div style={{ padding: '1rem 1rem 1rem 0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                              <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#0f172a' }}>
                                {img.file_name || `Fundus Capture #${idx + 1}`}
                              </span>
                              <span style={{
                                fontWeight: 700,
                                fontSize: '0.72rem',
                                padding: '2px 8px',
                                borderRadius: 4,
                                background: imgSev === 'HIGH' ? '#fef2f2' : imgSev === 'MEDIUM' ? '#fffbeb' : '#f0fdf4',
                                color: imgSev === 'HIGH' ? '#b91c1c' : imgSev === 'MEDIUM' ? '#b45309' : '#15803d',
                                border: `1px solid ${imgSev === 'HIGH' ? '#fca5a5' : imgSev === 'MEDIUM' ? '#fcd34d' : '#86efac'}`
                              }}>
                                {imgSev} SEVERITY
                              </span>
                            </div>

                            {/* DR Present vs No DR Result Badge */}
                            <div style={{ marginBottom: '0.75rem' }}>
                              <span style={{
                                display: 'inline-block',
                                fontSize: '0.86rem',
                                fontWeight: 700,
                                padding: '3px 10px',
                                borderRadius: 4,
                                background: isDrPresent ? '#fef2f2' : '#f0fdf4',
                                color: isDrPresent ? '#b91c1c' : '#15803d',
                                border: `1px solid ${isDrPresent ? '#fca5a5' : '#86efac'}`
                              }}>
                                {isDrPresent ? 'DR Present (Referral Advised)' : 'No DR Detected (Within Normal Limits)'}
                              </span>
                              <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '8px' }}>
                                • ICDR Grade: <strong>{img.icdr_grade || 'Evaluated'}</strong>
                              </span>
                            </div>

                            {/* DR Softmax Probability Metric */}
                            <div style={{ marginBottom: '0.85rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#334155', marginBottom: '3px' }}>
                                <span>DR Softmax Probability Score:</span>
                                <strong>{(softmaxVal * 100).toFixed(1)}%</strong>
                              </div>
                              <div style={{ height: '7px', background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                                <div
                                  style={{
                                    height: '100%',
                                    width: `${Math.min(100, Math.max(0, softmaxVal * 100))}%`,
                                    background: softmaxVal >= 0.75 ? '#dc2626' : softmaxVal >= 0.4 ? '#f59e0b' : '#16a34a',
                                    borderRadius: 4
                                  }}
                                />
                              </div>
                            </div>

                            {/* Candidate Lesion Counts for this Image */}
                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 5, padding: '0.65rem 0.85rem' }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                                Morphological Candidate Lesion Counts
                              </span>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', textAlign: 'center', fontSize: '0.76rem' }}>
                                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px' }}>
                                  <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block' }}>Microaneurysms</span>
                                  <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{lCounts.microaneurysms ?? lCounts.MA ?? 0}</strong>
                                </div>
                                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px' }}>
                                  <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block' }}>Hemorrhages</span>
                                  <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{lCounts.hemorrhages ?? lCounts.HEM ?? 0}</strong>
                                </div>
                                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px' }}>
                                  <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block' }}>Hard Exudates</span>
                                  <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{lCounts.hardExudates ?? lCounts.HE ?? 0}</strong>
                                </div>
                                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px' }}>
                                  <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block' }}>Cotton Wool</span>
                                  <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{lCounts.cottonWoolSpots ?? lCounts.CWS ?? 0}</strong>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.5rem' }}>
                            Quality Gate: <strong style={{ color: '#166534' }}>{img.quality_verdict || 'Passed (Diagnostic Acuity Met)'}</strong>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Modal Actions Footer */}
            <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '0.95rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Marking review complete archives this case and makes it <strong>not visible in the active priority queue</strong>.
              </div>
              <div style={{ display: 'flex', gap: '0.65rem' }}>
                <button
                  type="button"
                  onClick={() => setDoctorReviewModal({ isOpen: false, patient: null, images: [], loading: false })}
                  style={{
                    background: '#ffffff',
                    color: '#334155',
                    border: '1px solid #cbd5e1',
                    borderRadius: 4,
                    padding: '0.45rem 0.95rem',
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  Close Review
                </button>

                {doctorReviewModal.patient?.review_status !== 'completed' ? (
                  <button
                    type="button"
                    disabled={completingPatientId === doctorReviewModal.patient.id}
                    onClick={async () => {
                      await handleMarkPatientComplete(doctorReviewModal.patient.id)
                      setDoctorReviewModal(prev => ({ ...prev, isOpen: false }))
                    }}
                    style={{
                      background: '#15803d',
                      color: '#ffffff',
                      border: '1px solid #166534',
                      borderRadius: 4,
                      padding: '0.45rem 1.15rem',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: completingPatientId === doctorReviewModal.patient.id ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {completingPatientId === doctorReviewModal.patient.id ? 'Completing…' : '✓ Mark as Complete & Remove from Queue'}
                  </button>
                ) : (
                  <span style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 600, padding: '0.45rem 0.75rem' }}>
                    ✓ Review Completed
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 9. ADMIN RECORD INSPECTION MODAL                                          */}
      {/* ========================================================================= */}
      {inspectModal.isOpen && inspectModal.record && (
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
              borderRadius: 8,
              maxWidth: '680px',
              width: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              padding: '1.5rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontWeight: 700 }}>
                Screening Record Inspection — {inspectModal.record.screening_id}
              </h3>
              <button
                type="button"
                onClick={() => setInspectModal({ isOpen: false, record: null })}
                style={{ background: 'transparent', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            {inspectModal.record.image_data && (
              <div style={{ height: '220px', background: '#000000', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                <img src={inspectModal.record.image_data} alt={inspectModal.record.file_name} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
              </div>
            )}

            <table className="kv" style={{ width: '100%', fontSize: '0.84rem' }}>
              <tbody>
                <tr><td>Patient ID:</td><td><code>{(inspectModal.record.patient_id || 'unlinked').toLowerCase()}</code></td></tr>
                <tr><td>Patient Name:</td><td>{inspectModal.record.patient_name || 'Anonymous'}</td></tr>
                <tr><td>Phone Number:</td><td>{inspectModal.record.patient_phone || 'None'}</td></tr>
                <tr><td>File Name:</td><td>{inspectModal.record.file_name}</td></tr>
                <tr><td>Eye:</td><td>{inspectModal.record.eye || 'OD'}</td></tr>
                <tr><td>Diagnosis:</td><td><strong>{inspectModal.record.prediction}</strong></td></tr>
                <tr><td>DR Softmax Score:</td><td>{inspectModal.record.dr_softmax !== null ? `${(inspectModal.record.dr_softmax * 100).toFixed(1)}%` : 'N/A'}</td></tr>
                <tr><td>Severity Level:</td><td><strong style={{ color: inspectModal.record.severity_level === 'HIGH' ? '#b91c1c' : '#15803d' }}>{inspectModal.record.severity_level || 'LOW'}</strong></td></tr>
                <tr><td>Review Status:</td><td>{inspectModal.record.review_status || 'pending'}</td></tr>
                <tr><td>Screened Timestamp:</td><td>{new Date(inspectModal.record.created_at).toLocaleString()}</td></tr>
              </tbody>
            </table>

            <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setInspectModal({ isOpen: false, record: null })}
                style={{ background: '#0f172a', color: '#ffffff', border: 'none', borderRadius: 4, padding: '0.45rem 1rem', fontSize: '0.82rem', cursor: 'pointer' }}
              >
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
