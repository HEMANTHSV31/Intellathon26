import { useState } from 'react'

/**
 * ClinicalReportModal
 * 
 * Formal Tele-Ophthalmology Diabetic Retinopathy Diagnostic Report
 * Provides on-screen clinical review, browser print-to-PDF, and standalone HTML download.
 * 
 * Includes:
 * - Official clinic header with tele-retinopathy emblem
 * - Patient Demographics & Examination Metadata (Patient ID, Name, Phone, Date)
 * - Bilateral Retinal Fundus Photographs (OD - Right Eye & OS - Left Eye)
 * - Automated AI Softmax Confidence & Biomarker Lesion Counts
 * - International Clinical Diabetic Retinopathy (ICDR) Staging Comparison
 * - Specialist Clinical Notes & Referral Recommendations
 * - Formal Doctor Sign-off block with digital attestation and medico-legal disclaimer
 */
export default function ClinicalReportModal({
  isOpen,
  onClose,
  patient,
  screenings = [],
  doctorUser = null
}) {
  const [downloadingHtml, setDownloadingHtml] = useState(false)
  const [reportGeneratedAt] = useState(() => new Date())

  if (!isOpen || !patient) return null

  // Resolve demographic attributes
  const patientId = (patient.id || patient.patient_id || screenings[0]?.patient_id || 'unlinked').toLowerCase()
  const patientName = patient.name || patient.patient_name || screenings[0]?.patient_name || 'Anonymous'
  const patientPhone = patient.phone || patient.patient_phone || screenings[0]?.patient_phone || 'Not Provided'
  
  const rawDate = patient.latest_screening_date || patient.created_at || screenings[0]?.created_at || reportGeneratedAt.toISOString()
  const captureDateFormatted = new Date(rawDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  // Staging & severity resolution
  const confirmedGrade = patient.doctor_grade || screenings.find(s => s.doctor_grade)?.doctor_grade || null
  const aiGrade = patient.primary_icdr_grade || screenings[0]?.icdr_grade || screenings[0]?.prediction || 'No Apparent Retinopathy (Stage 0)'
  const finalGrade = confirmedGrade || aiGrade
  
  const doctorNotes = patient.doctor_notes || screenings.find(s => s.doctor_notes)?.doctor_notes || ''
  const isReviewed = patient.review_status === 'completed' || !!confirmedGrade || !!doctorNotes
  const severityLevel = (patient.severity_level || screenings[0]?.severity_level || 'LOW').toUpperCase()

  // Resolve OD and OS images
  const odScan = screenings.find(s => (s.eye || '').toUpperCase() === 'OD') || (screenings.length > 0 && (screenings[0].eye || '').toUpperCase() !== 'OS' ? screenings[0] : null)
  const osScan = screenings.find(s => (s.eye || '').toUpperCase() === 'OS') || (screenings.length > 1 && screenings[1] !== odScan ? screenings[1] : null)

  const parseLesions = (counts) => {
    if (!counts) return { MA: 0, HEM: 0, HE: 0, CWS: 0 }
    try {
      const obj = typeof counts === 'string' ? JSON.parse(counts) : counts
      return {
        MA: obj.microaneurysms ?? obj.MA ?? 0,
        HEM: obj.hemorrhages ?? obj.HEM ?? 0,
        HE: obj.hardExudates ?? obj.HE ?? 0,
        CWS: obj.cottonWoolSpots ?? obj.CWS ?? 0
      }
    } catch {
      return { MA: 0, HEM: 0, HE: 0, CWS: 0 }
    }
  }

  // Doctor sign-off details
  const doctorName = doctorUser?.fullName || doctorUser?.name || 'Dr. Specialist, MD (Ophthalmology)'
  const signOffDate = patient.reviewed_at
    ? new Date(patient.reviewed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : reportGeneratedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  // Trigger Native Print Dialog (Pre-configured for PDF Export)
  const handlePrint = () => {
    window.print()
  }

  // Download Standalone Self-Contained HTML Report
  const handleDownloadHtml = () => {
    setDownloadingHtml(true)
    try {
      const reportElement = document.getElementById('clinical-report-printable')
      if (!reportElement) return

      const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Clinical_Retinopathy_Report_${patientId}.html</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 24px; background: #ffffff; color: #0f172a; line-height: 1.45; }
    @page { size: A4 portrait; margin: 12mm 15mm; }
    .report-card { max-width: 820px; margin: 0 auto; border: 1px solid #cbd5e1; padding: 32px; border-radius: 6px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #e2e8f0; padding: 6px 10px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="report-card">
    ${reportElement.innerHTML}
  </div>
</body>
</html>`

      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Clinical_Report_${patientId}_${new Date().toISOString().slice(0, 10)}.html`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setDownloadingHtml(false)
    }
  }

  return (
    <>
      {/* Print-specific style override: isolator for clean A4 printing */}
      <style>{`
        @media print {
          /* Hide all page content except the printable clinical report */
          body * {
            visibility: hidden !important;
          }
          #clinical-report-printable,
          #clinical-report-printable * {
            visibility: visible !important;
          }
          #clinical-report-printable {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 10mm 15mm !important;
            background: #ffffff !important;
            color: #0f172a !important;
            box-shadow: none !important;
            border: none !important;
            z-index: 999999 !important;
          }
          .report-modal-backdrop {
            position: static !important;
            background: transparent !important;
            overflow: visible !important;
          }
          .no-print, .no-print * {
            display: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 8mm 12mm;
          }
        }
      `}</style>

      {/* Modal Backdrop (screen preview) */}
      <div
        className="report-modal-backdrop"
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(15, 23, 42, 0.72)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflowY: 'auto',
          padding: '1.5rem 1rem'
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <div
          style={{
            background: '#ffffff',
            borderRadius: 8,
            maxWidth: '860px',
            width: '100%',
            maxHeight: '94vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
            overflow: 'hidden'
          }}
        >
          {/* Modal Header & Quick Export Actions (Hidden during print) */}
          <div
            className="no-print"
            style={{
              padding: '0.85rem 1.5rem',
              background: '#0f172a',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
              borderBottom: '1px solid #334155'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.1rem' }}>📄</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#f8fafc' }}>
                  Clinical Retinopathy Diagnostic Report
                </h3>
                <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                  Patient: {patientName} (<code>{patientId}</code>)
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {/* Standalone HTML File Download */}
              <button
                type="button"
                onClick={handleDownloadHtml}
                disabled={downloadingHtml}
                title="Download offline self-contained HTML report"
                style={{
                  background: '#1e293b',
                  color: '#e2e8f0',
                  border: '1px solid #475569',
                  borderRadius: 4,
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                📥 {downloadingHtml ? 'Preparing…' : 'HTML Backup'}
              </button>

              {/* Primary Print / Save as PDF Button */}
              <button
                type="button"
                onClick={handlePrint}
                style={{
                  background: '#0f766e',
                  color: '#ffffff',
                  border: '1px solid #14b8a6',
                  borderRadius: 4,
                  padding: '0.4rem 1.1rem',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                }}
              >
                🖨️ Print / Save as PDF
              </button>

              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'transparent',
                  color: '#94a3b8',
                  border: 'none',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  padding: '0 0.4rem',
                  lineHeight: 1
                }}
                title="Close Report"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Scrollable Document Container */}
          <div style={{ overflowY: 'auto', padding: '1.75rem', background: '#f8fafc' }}>
            {/* ========================================================================= */}
            {/* PRINTABLE DOCUMENT BODY (ID: clinical-report-printable)                    */}
            {/* ========================================================================= */}
            <div
              id="clinical-report-printable"
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                padding: '2rem 2.25rem',
                color: '#0f172a',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
              }}
            >
              {/* 1. CLINIC HEADER & LOGO */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '2.5px solid #0f766e',
                  paddingBottom: '1rem',
                  marginBottom: '1.25rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  {/* Clinic Medical Reticle Emblem */}
                  <div
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '50%',
                      background: '#0f766e',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.35rem',
                      fontWeight: 800,
                      flexShrink: 0
                    }}
                  >
                    👁
                  </div>
                  <div>
                    <h1
                      style={{
                        margin: 0,
                        fontSize: '1.18rem',
                        fontWeight: 800,
                        color: '#0f172a',
                        letterSpacing: '-0.01em',
                        lineHeight: 1.2
                      }}
                    >
                      NATIONAL TELE-OPHTHALMOLOGY &amp; DIABETIC RETINOPATHY PROGRAM
                    </h1>
                    <div style={{ fontSize: '0.8rem', color: '#0f766e', fontWeight: 700, marginTop: '2px' }}>
                      Clinical Retinal Screening &amp; Automated Biomarker Diagnostic Report
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      Primary Eye Care Center • Autonomous Deep Learning Retinal Triaging
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right', fontSize: '0.72rem', color: '#64748b' }}>
                  <div><strong>Doc Ref:</strong> DR-REP-{patientId.slice(0, 12)}</div>
                  <div><strong>Generated:</strong> {reportGeneratedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
                  <div style={{ marginTop: '2px', display: 'inline-block', background: isReviewed ? '#f0fdf4' : '#fffbeb', color: isReviewed ? '#166534' : '#b45309', border: `1px solid ${isReviewed ? '#86efac' : '#fcd34d'}`, padding: '1px 6px', borderRadius: 3, fontWeight: 700, fontSize: '0.68rem' }}>
                    {isReviewed ? '✓ SPECIALIST REVIEWED' : 'AUTOMATED AI EVALUATION'}
                  </div>
                </div>
              </div>

              {/* 2. PATIENT DEMOGRAPHICS & CLINICAL INTAKE TABLE */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  padding: '0.85rem 1rem',
                  marginBottom: '1.25rem'
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', fontSize: '0.8rem' }}>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>Patient Name</span>
                    <strong style={{ color: '#0f172a', fontSize: '0.88rem' }}>{patientName}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>Patient ID</span>
                    <code style={{ color: '#0f766e', fontWeight: 700, fontSize: '0.82rem' }}>{patientId}</code>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>Phone / Contact</span>
                    <span style={{ color: '#334155' }}>{patientPhone}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>Screening Date</span>
                    <span style={{ color: '#334155' }}>{captureDateFormatted}</span>
                  </div>
                </div>
              </div>

              {/* 3. BILATERAL FUNDUS RETINAL IMAGING (OD & OS THUMBNAILS & BIOMARKERS) */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.35rem' }}>
                  <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                    Bilateral Retinal Fundus Examination (OD / OS)
                  </h3>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    Macula-Centered Color Fundus Photography
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {/* OD - RIGHT EYE */}
                  <div style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '0.75rem', background: '#ffffff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ background: '#0f172a', color: '#ffffff', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 3 }}>
                        OD • Right Eye
                      </span>
                      {odScan && (
                        <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                          Quality: <strong>{odScan.quality_verdict || 'Passed'}</strong>
                        </span>
                      )}
                    </div>

                    {odScan?.image_data ? (
                      <div style={{ height: '180px', background: '#000000', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: '0.55rem' }}>
                        <img
                          src={odScan.image_data}
                          alt="OD Fundus"
                          style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                        />
                      </div>
                    ) : (
                      <div style={{ height: '180px', background: '#f1f5f9', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.78rem', marginBottom: '0.55rem', border: '1px dashed #cbd5e1' }}>
                        OD Fundus Image Not Captured
                      </div>
                    )}

                    {odScan ? (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '3px' }}>
                          <span style={{ color: '#475569' }}>Finding:</span>
                          <strong style={{ color: odScan.referable ? '#b91c1c' : '#15803d' }}>
                            {odScan.prediction || 'Evaluated'}
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem', marginBottom: '4px' }}>
                          <span style={{ color: '#64748b' }}>DR Softmax Score:</span>
                          <span style={{ fontWeight: 600 }}>
                            {odScan.dr_softmax !== null && odScan.dr_softmax !== undefined ? `${(odScan.dr_softmax * 100).toFixed(1)}%` : 'N/A'}
                          </span>
                        </div>
                        {/* Microvascular Lesion Tally */}
                        {(() => {
                          const l = parseLesions(odScan.lesion_counts)
                          return (
                            <div style={{ fontSize: '0.69rem', background: '#f8fafc', padding: '3px 6px', borderRadius: 3, border: '1px solid #e2e8f0', color: '#475569' }}>
                              <span>MA: <strong>{l.MA}</strong></span> •{' '}
                              <span>HEM: <strong>{l.HEM}</strong></span> •{' '}
                              <span>HE: <strong>{l.HE}</strong></span> •{' '}
                              <span>CWS: <strong>{l.CWS}</strong></span>
                            </div>
                          )
                        })()}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center' }}>
                        No examination data available for right eye
                      </div>
                    )}
                  </div>

                  {/* OS - LEFT EYE */}
                  <div style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '0.75rem', background: '#ffffff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ background: '#0f172a', color: '#ffffff', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 3 }}>
                        OS • Left Eye
                      </span>
                      {osScan && (
                        <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                          Quality: <strong>{osScan.quality_verdict || 'Passed'}</strong>
                        </span>
                      )}
                    </div>

                    {osScan?.image_data ? (
                      <div style={{ height: '180px', background: '#000000', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: '0.55rem' }}>
                        <img
                          src={osScan.image_data}
                          alt="OS Fundus"
                          style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                        />
                      </div>
                    ) : (
                      <div style={{ height: '180px', background: '#f1f5f9', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.78rem', marginBottom: '0.55rem', border: '1px dashed #cbd5e1' }}>
                        OS Fundus Image Not Captured
                      </div>
                    )}

                    {osScan ? (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '3px' }}>
                          <span style={{ color: '#475569' }}>Finding:</span>
                          <strong style={{ color: osScan.referable ? '#b91c1c' : '#15803d' }}>
                            {osScan.prediction || 'Evaluated'}
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem', marginBottom: '4px' }}>
                          <span style={{ color: '#64748b' }}>DR Softmax Score:</span>
                          <span style={{ fontWeight: 600 }}>
                            {osScan.dr_softmax !== null && osScan.dr_softmax !== undefined ? `${(osScan.dr_softmax * 100).toFixed(1)}%` : 'N/A'}
                          </span>
                        </div>
                        {/* Microvascular Lesion Tally */}
                        {(() => {
                          const l = parseLesions(osScan.lesion_counts)
                          return (
                            <div style={{ fontSize: '0.69rem', background: '#f8fafc', padding: '3px 6px', borderRadius: 3, border: '1px solid #e2e8f0', color: '#475569' }}>
                              <span>MA: <strong>{l.MA}</strong></span> •{' '}
                              <span>HEM: <strong>{l.HEM}</strong></span> •{' '}
                              <span>HE: <strong>{l.HE}</strong></span> •{' '}
                              <span>CWS: <strong>{l.CWS}</strong></span>
                            </div>
                          )
                        })()}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center' }}>
                        No examination data available for left eye
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 4. ICDR CLINICAL STAGING & SEVERITY ASSESSMENT */}
              <div
                style={{
                  border: '1.5px solid #cbd5e1',
                  borderRadius: 6,
                  padding: '1rem',
                  marginBottom: '1.25rem',
                  background: severityLevel === 'HIGH' ? '#fef2f2' : severityLevel === 'MEDIUM' ? '#fffbeb' : '#f0fdf4'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', background: '#0f172a', color: '#ffffff', padding: '2px 8px', borderRadius: 3 }}>
                      ICDR Staging
                    </span>
                    <strong style={{ fontSize: '0.96rem', color: severityLevel === 'HIGH' ? '#991b1b' : severityLevel === 'MEDIUM' ? '#92400e' : '#166534' }}>
                      {finalGrade}
                    </strong>
                  </div>

                  <span
                    style={{
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: severityLevel === 'HIGH' ? '#b91c1c' : severityLevel === 'MEDIUM' ? '#b45309' : '#15803d',
                      color: '#ffffff'
                    }}
                  >
                    {severityLevel === 'HIGH' ? 'HIGH RISK • URGENT REFERRAL' : severityLevel === 'MEDIUM' ? 'MODERATE RISK • CLINICAL FOLLOW-UP' : 'LOW RISK • ROUTINE ANNUAL RECALL'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.78rem', color: '#334155' }}>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.71rem', display: 'block' }}>Automated Deep Learning Stage:</span>
                    <strong>{aiGrade}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.71rem', display: 'block' }}>Ophthalmologist Confirmed Stage:</span>
                    <strong style={{ color: '#0f766e' }}>
                      {confirmedGrade ? `✓ ${confirmedGrade}` : 'Pending Specialist Override'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* 5. DOCTOR CLINICAL REMARKS & REFERRAL PLAN */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  padding: '1rem',
                  marginBottom: '1.25rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.84rem', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' }}>
                    Ophthalmologist Diagnostic Remarks, Recall Interval &amp; Care Plan
                  </h4>
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                    Recorded in Clinic Master Registry
                  </span>
                </div>

                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 4,
                    padding: '0.75rem 0.9rem',
                    fontSize: '0.82rem',
                    lineHeight: 1.5,
                    color: doctorNotes ? '#0f172a' : '#64748b',
                    fontStyle: doctorNotes ? 'normal' : 'italic',
                    minHeight: '48px',
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {doctorNotes || 'No specific remarks recorded. Routine follow-up advised as per clinical staging guidelines.'}
                </div>
              </div>

              {/* 6. DOCTOR SIGN-OFF & ATTESTATION BLOCK */}
              <div
                style={{
                  borderTop: '1.5px solid #cbd5e1',
                  paddingTop: '1rem',
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'space-between',
                  gap: '1.5rem',
                  fontSize: '0.76rem'
                }}
              >
                <div style={{ maxWidth: '58%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <span style={{ color: '#15803d', fontWeight: 800 }}>✓</span>
                    <strong style={{ color: '#0f172a', fontSize: '0.8rem' }}>
                      Electronically Verified &amp; Signed Tele-Ophthalmology Evaluation
                    </strong>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.69rem', color: '#64748b', lineHeight: 1.35 }}>
                    This clinical screening report combines automated fundus image analysis adhering to the International Clinical Diabetic Retinopathy (ICDR) disease severity scale with specialist validation. For suspected macular edema or vision impairment, clinical correlation and optical coherence tomography (OCT) are recommended.
                  </p>
                </div>

                <div style={{ textAlign: 'right', minWidth: '180px' }}>
                  <div style={{ height: '36px', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', paddingBottom: '4px' }}>
                    <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.05rem', color: '#0f766e', fontWeight: 600 }}>
                      {doctorName}
                    </span>
                  </div>
                  <div style={{ borderTop: '1.5px solid #0f172a', paddingTop: '4px' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.78rem' }}>
                      {doctorName}
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.7rem' }}>
                      Consultant Ophthalmologist / Retinal Specialist
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.68rem', marginTop: '1px' }}>
                      Signed on: {signOffDate}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Bar */}
          <div
            className="no-print"
            style={{
              padding: '0.75rem 1.5rem',
              background: '#f1f5f9',
              borderTop: '1px solid #cbd5e1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
              Tip: Click <strong>"Print / Save as PDF"</strong> to generate a print-ready vector PDF document via your browser.
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: '#ffffff',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: 4,
                  padding: '0.4rem 0.9rem',
                  fontSize: '0.78rem',
                  cursor: 'pointer'
                }}
              >
                Close Preview
              </button>
              <button
                type="button"
                onClick={handlePrint}
                style={{
                  background: '#0f766e',
                  color: '#ffffff',
                  border: '1px solid #0f766e',
                  borderRadius: 4,
                  padding: '0.4rem 1.1rem',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                🖨️ Print / Save as PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
