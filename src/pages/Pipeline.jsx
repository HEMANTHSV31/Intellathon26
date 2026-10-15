import { useEffect, useState } from 'react'
import { DEFAULTS, FIELDS, updatePipeline } from '../utils/pipelineModel'

export default function Pipeline() {
  const [activeTab, setActiveTab] = useState('flow') // 'flow' | 'dynamic' | 'matlab'
  const [matlabStatus, setMatlabStatus] = useState(null)

  useEffect(() => {
    // Initial draw
    updatePipeline()

    const handleInput = () => {
      updatePipeline()
    }

    const fieldKeys = Object.keys(FIELDS)
    fieldKeys.forEach(k => {
      const el = document.getElementById(FIELDS[k])
      if (el) {
        el.addEventListener('input', handleInput)
        el.addEventListener('change', handleInput)
      }
    })

    const resetBtn = document.getElementById('p-reset')
    const handleReset = () => {
      fieldKeys.forEach(k => {
        const el = document.getElementById(FIELDS[k])
        if (el) el.value = DEFAULTS[k]
      })
      updatePipeline()
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', handleReset)
    }

    // Check MATLAB status from backend API
    fetch('/api/simulink/status')
      .then(res => res.json())
      .then(data => setMatlabStatus(data))
      .catch(() => setMatlabStatus({ matlabInstalled: false, simulinkFilesReady: true }))

    return () => {
      fieldKeys.forEach(k => {
        const el = document.getElementById(FIELDS[k])
        if (el) {
          el.removeEventListener('input', handleInput)
          el.removeEventListener('change', handleInput)
        }
      })
      if (resetBtn) {
        resetBtn.removeEventListener('click', handleReset)
      }
    }
  }, [])

  // Re-run pipeline render when tab switches so SVGs redraw properly
  useEffect(() => {
    setTimeout(() => {
      updatePipeline()
    }, 50)
  }, [activeTab])

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>Where the screening programme chokes</h1>
          <p className="lede" style={{ marginBottom: '0.5rem' }}>
            A block model of the whole screening service, from the fundus camera to the
            ophthalmologist. Modeled using <strong>Simulink and MATLAB</strong> systems engineering.
          </p>
        </div>
        {matlabStatus && (
          <div style={{
            fontSize: '12px',
            padding: '5px 12px',
            borderRadius: '5px',
            background: matlabStatus.matlabInstalled ? '#f0fdf4' : '#f0f9ff',
            border: `1px solid ${matlabStatus.matlabInstalled ? '#bbf7d0' : '#bae6fd'}`,
            color: matlabStatus.matlabInstalled ? '#166534' : '#0369a1',
            fontWeight: 500
          }}>
            {matlabStatus.matlabInstalled
              ? 'MATLAB Engine detected on system'
              : 'MATLAB / Simulink Model Ready in ./simulink'}
          </div>
        )}
      </div>

      <div className="notice" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderLeft: '4px solid #0f172a', borderRadius: '5px' }}>
        <strong>Systems Engineering Capacity Model (MATLAB / Simulink).</strong> This clinical throughput
        planning model is implemented as a formal <strong>Simulink dynamic block model</strong> in MATLAB
        (<code>screening_pipeline_model.slx</code>). It evaluates signal flow, saturation ceilings, and
        integrator queues ($\dot&#123;Q&#125; = \max(0, \lambda(t) - \mu(t))$). You can interact with the
        model in real time below or run the complete Simulink simulation suite in MATLAB.
      </div>

      {/* View Switcher Tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', margin: '1.25rem 0 1rem' }}>
        <button
          type="button"
          onClick={() => setActiveTab('flow')}
          style={{
            padding: '6px 14px',
            borderRadius: '5px',
            border: `1px solid ${activeTab === 'flow' ? '#0f172a' : '#cbd5e1'}`,
            background: activeTab === 'flow' ? '#0f172a' : '#ffffff',
            color: activeTab === 'flow' ? '#ffffff' : '#475569',
            fontWeight: activeTab === 'flow' ? 600 : 500,
            cursor: 'pointer',
            fontSize: '0.84rem'
          }}
        >
          Signal-Flow Block Diagram
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('dynamic')}
          style={{
            padding: '6px 14px',
            borderRadius: '5px',
            border: `1px solid ${activeTab === 'dynamic' ? '#0f172a' : '#cbd5e1'}`,
            background: activeTab === 'dynamic' ? '#0f172a' : '#ffffff',
            color: activeTab === 'dynamic' ? '#ffffff' : '#475569',
            fontWeight: activeTab === 'dynamic' ? 600 : 500,
            cursor: 'pointer',
            fontSize: '0.84rem'
          }}
        >
          Simulink 365-Day Dynamic Queues
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('matlab')}
          style={{
            padding: '6px 14px',
            borderRadius: '5px',
            border: `1px solid ${activeTab === 'matlab' ? '#0f172a' : '#cbd5e1'}`,
            background: activeTab === 'matlab' ? '#0f172a' : '#ffffff',
            color: activeTab === 'matlab' ? '#ffffff' : '#475569',
            fontWeight: activeTab === 'matlab' ? 600 : 500,
            cursor: 'pointer',
            fontSize: '0.84rem'
          }}
        >
          MATLAB / Simulink Files &amp; Code
        </button>
      </div>

      <hr className="rule" />

      {/* TAB 1: SIGNAL-FLOW DIAGRAM */}
      {activeTab === 'flow' && (
        <section>
          <h2>Signal-flow diagram</h2>
          <p className="small">
            Each block represents a screening subsystem. Blocks are filled by their utilisation &mdash; demand
            divided by capacity. Wires carry the demand handed from one stage to the next; where a stage
            cannot meet the demand, a red badge gives the daily shortfall. The choke point is drawn with a
            heavy outline and labelled. Everything updates live as you change the parameters below.
          </p>

          <svg
            id="flow"
            className="flowchart"
            viewBox="0 0 1120 520"
            role="img"
            aria-labelledby="flow-title flow-desc"
          >
            <title id="flow-title">Screening pipeline capacity block diagram</title>
            <desc id="flow-desc">
              Blocks for acquisition, quality gating, network transfer, AI inference,
              referral triage and specialist review, each annotated with capacity, demand and utilisation.
              The bottleneck stage is outlined heavily and labelled as the choke point.
            </desc>
          </svg>

          <div className="util-scale">
            <span className="small">Utilisation</span>
            <div
              className="util-bar"
              role="img"
              aria-label="Colour scale running from dark green at zero per cent utilisation through green, amber and orange to red at one hundred and twenty per cent or more."
            />
          </div>
          <div className="util-ticks">
            <span>0% idle</span>
            <span>50%</span>
            <span>75%</span>
            <span>100% saturated</span>
            <span>&ge;120% over</span>
          </div>

          <div id="verdict" />
        </section>
      )}

      {/* TAB 2: DYNAMIC QUEUING INTEGRATORS */}
      {activeTab === 'dynamic' && (
        <section>
          <h2>Simulink Dynamic Continuous Queuing Simulation (365 Days)</h2>
          <p className="small">
            In Simulink, queues are modeled using bounded <strong>Integrator blocks</strong> (with lower saturation limit = 0).
            When arrival demand rate $\lambda(t)$ exceeds service capacity $\mu(t)$, the queue accumulates continuously:
            $Q(t) = \int_0^t \max(0, \lambda(\tau) - \mu(\tau)) d\tau$. This dynamic chart reflects stochastic arrival variance
            and periodic demand surges across all 4 operational stages over a full calendar year.
          </p>

          <svg
            id="dynamic-queues-chart"
            className="flowchart"
            viewBox="0 0 1120 280"
            role="img"
            aria-label="Simulink dynamic 365-day queue simulation chart for acquisition, network, inference, and review stages"
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '4px', borderLeft: '4px solid #2b7fff' }}>
              <strong>Image Acquisition</strong>
              <div style={{ fontSize: '12px', color: '#555', marginTop: '4px' }}>
                Camera stations &amp; retake feedback loop.
              </div>
            </div>
            <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '4px', borderLeft: '4px solid #e4a900' }}>
              <strong>Network Transfer</strong>
              <div style={{ fontSize: '12px', color: '#555', marginTop: '4px' }}>
                Bandwidth limit &amp; daily upload window.
              </div>
            </div>
            <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '4px', borderLeft: '4px solid #9747ff' }}>
              <strong>AI Inference</strong>
              <div style={{ fontSize: '12px', color: '#555', marginTop: '4px' }}>
                Automated 24/7 compute node queue.
              </div>
            </div>
            <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '4px', borderLeft: '4px solid #d92525' }}>
              <strong>Specialist Review</strong>
              <div style={{ fontSize: '12px', color: '#555', marginTop: '4px' }}>
                Ophthalmologist clinic waitlist.
              </div>
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: MATLAB & SIMULINK FILES & EXPORT */}
      {activeTab === 'matlab' && (
        <section>
          <h2>MATLAB &amp; Simulink Production Suite</h2>
          <p>
            The complete MATLAB scripts and programmatic Simulink block model generator are stored in the
            <code>./simulink</code> folder of this repository. You can download and run them directly in MATLAB.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', margin: '1.25rem 0' }}>
            <div style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '1rem', background: '#fff' }}>
              <h4 style={{ margin: '0 0 0.5rem' }}>1. Build Simulink Block Model (.slx)</h4>
              <p style={{ fontSize: '13px', color: '#666', marginBottom: '0.75rem' }}>
                Programmatically creates <code>screening_pipeline_model.slx</code> with blocks, wires, scopes, and displays.
              </p>
              <a
                href="/api/simulink/download/build_screening_pipeline_model.m"
                download="build_screening_pipeline_model.m"
                style={{ display: 'inline-block', padding: '6px 12px', background: '#005a9e', color: '#fff', borderRadius: '4px', textDecoration: 'none', fontSize: '13px', fontWeight: 600 }}
              >
                Download build_screening_pipeline_model.m
              </a>
            </div>

            <div style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '1rem', background: '#fff' }}>
              <h4 style={{ margin: '0 0 0.5rem' }}>2. Simulation Runner &amp; Plots</h4>
              <p style={{ fontSize: '13px', color: '#666', marginBottom: '0.75rem' }}>
                Executes the Simulink simulation, generates bottleneck reports, and creates publication-ready MATLAB figures.
              </p>
              <a
                href="/api/simulink/download/run_screening_simulation.m"
                download="run_screening_simulation.m"
                style={{ display: 'inline-block', padding: '6px 12px', background: '#005a9e', color: '#fff', borderRadius: '4px', textDecoration: 'none', fontSize: '13px', fontWeight: 600 }}
              >
                Download run_screening_simulation.m
              </a>
            </div>

            <div style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '1rem', background: '#fff' }}>
              <h4 style={{ margin: '0 0 0.5rem' }}>3. Parameters Configuration</h4>
              <p style={{ fontSize: '13px', color: '#666', marginBottom: '0.75rem' }}>
                Defines target population, camera stations, bandwidth, AI rates, and doctor capacity in MATLAB workspace.
              </p>
              <a
                href="/api/simulink/download/parameters.m"
                download="parameters.m"
                style={{ display: 'inline-block', padding: '6px 12px', background: '#005a9e', color: '#fff', borderRadius: '4px', textDecoration: 'none', fontSize: '13px', fontWeight: 600 }}
              >
                Download parameters.m
              </a>
            </div>

            <div style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '1rem', background: '#fff' }}>
              <h4 style={{ margin: '0 0 0.5rem' }}>4. Vectorized Solver &amp; Monte Carlo</h4>
              <p style={{ fontSize: '13px', color: '#666', marginBottom: '0.75rem' }}>
                High-speed MATLAB solver for stochastic sweeps, arrival surges, and sensitivity analysis.
              </p>
              <a
                href="/api/simulink/download/simulate_steady_and_dynamic.m"
                download="simulate_steady_and_dynamic.m"
                style={{ display: 'inline-block', padding: '6px 12px', background: '#005a9e', color: '#fff', borderRadius: '4px', textDecoration: 'none', fontSize: '13px', fontWeight: 600 }}
              >
                Download simulate_steady_and_dynamic.m
              </a>
            </div>
          </div>

          <h3>Running in MATLAB Command Window</h3>
          <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '1rem', borderRadius: '6px', overflowX: 'auto', fontSize: '13px' }}>
{`% Navigate to the repository simulink folder
cd('d:/Projects/DiabeticRentinopathy/Intellathon26/simulink');

% 1. Load baseline parameters
run('parameters.m');

% 2. Build and inspect the Simulink block diagram
run('build_screening_pipeline_model.m');
open_system('screening_pipeline_model');

% 3. Run the full 365-day dynamic simulation with plots
run('run_screening_simulation.m');`}
          </pre>
        </section>
      )}

      {/* Model Grid: Controls and Outputs */}
      <div className="model-grid" style={{ marginTop: '1.5rem' }}>
        <div>
          <h3>Stage by stage</h3>
          <table className="stage-table" id="stage-table" />

          <h3>Backlog, if nothing changes</h3>
          <p className="small">
            Unmet demand does not disappear; it queues. This is the queue at the choke
            point accumulating over twelve months at the settings on the right.
          </p>
          <svg
            id="backlog"
            className="backlog-chart"
            viewBox="0 0 1120 260"
            role="img"
            aria-labelledby="bk-title bk-desc"
          >
            <title id="bk-title">Projected backlog over twelve months</title>
            <desc id="bk-desc">
              Area chart of unscreened patients accumulating month by month at the
              current settings. The twelve-month figure is repeated in the text above.
            </desc>
          </svg>

          <h3>What to fix first</h3>
          <p className="small">
            Relieving the choke point only helps until the next stage becomes the limit.
            This lists the stages in the order they would start binding, with the ceiling each one
            imposes on the programme.
          </p>
          <ol className="relief-list" id="relief" />
        </div>

        <aside className="controls">
          <h3>Programme parameters</h3>

          <div className="grp">
            <p className="grp-title">Demand</p>
            <label className="field">
              Population to screen (people/year)
              <input type="number" id="p-target" defaultValue={DEFAULTS.target} min="1" step="1000" />
            </label>
            <label className="field">
              Images captured per patient
              <input type="number" id="p-perpatient" defaultValue={DEFAULTS.perPatient} min="1" step="1" />
            </label>
            <div className="field-note">Two is one macula-centred field per eye.</div>
          </div>

          <div className="grp">
            <p className="grp-title">Acquisition</p>
            <label className="field">
              Camera stations
              <input type="number" id="p-stations" defaultValue={DEFAULTS.stations} min="1" step="1" />
            </label>
            <label className="field">
              Images per station per day
              <input type="number" id="p-perstation" defaultValue={DEFAULTS.perStation} min="1" step="5" />
            </label>
            <label className="field">
              Quality reject rate (%)
              <input type="number" id="p-reject" defaultValue={DEFAULTS.rejectPct} min="0" max="90" step="1" />
            </label>
            <div className="field-note">Rejected captures are retaken, so they load the camera twice.</div>
          </div>

          <div className="grp">
            <p className="grp-title">Network</p>
            <label className="field">
              Bandwidth (Mbps)
              <input type="number" id="p-bandwidth" defaultValue={DEFAULTS.bandwidth} min="0.1" step="0.5" />
            </label>
            <label className="field">
              Average image size (MB)
              <input type="number" id="p-imgsize" defaultValue={DEFAULTS.imgSizeMB} min="0.05" step="0.1" />
            </label>
            <label className="field">
              Transfer hours per day
              <input type="number" id="p-nethours" defaultValue={DEFAULTS.netHours} min="0.5" max="24" step="0.5" />
            </label>
          </div>

          <div className="grp">
            <p className="grp-title">Inference</p>
            <label className="field">
              Throughput (images/min/node)
              <input type="number" id="p-modelrate" defaultValue={DEFAULTS.modelRate} min="0.01" step="0.5" />
            </label>
            <label className="field">
              Inference nodes
              <input type="number" id="p-nodes" defaultValue={DEFAULTS.nodes} min="1" step="1" />
            </label>
            <div className="field-note">
              Runs unattended, so 24 h/day is assumed. The screening page measures
              this rate live on your own device.
            </div>
          </div>

          <div className="grp">
            <p className="grp-title">Specialist review</p>
            <label className="field">
              Referral rate (%)
              <input type="number" id="p-referral" defaultValue={DEFAULTS.referralPct} min="0" max="100" step="1" />
            </label>
            <label className="field">
              Ophthalmologists available
              <input type="number" id="p-docs" defaultValue={DEFAULTS.docs} min="0" step="1" />
            </label>
            <label className="field">
              Reviews per ophthalmologist per day
              <input type="number" id="p-perdoc" defaultValue={DEFAULTS.perDoc} min="1" step="5" />
            </label>
            <div className="field-note">
              Only flagged patients reach a specialist &mdash; that gate is the
              entire point of automating the first read.
            </div>
          </div>

          <div className="actions">
            <button id="p-reset" type="button">Reset to defaults</button>
          </div>
        </aside>
      </div>

      <hr className="rule" />

      <section>
        <h2>Mathematical Formulation (Simulink Equations)</h2>
        <p>
          Every capacity is expressed as an explicit analytical block function in Simulink, allowing direct
          parameter sweeps and validation.
        </p>

        <table className="matrix">
          <tbody>
            <tr><th>Quantity</th><th>Simulink Definition</th></tr>
            <tr><td>Patients per day</td><td><code>target / 365</code></td></tr>
            <tr><td>Usable images per day</td><td><code>patientsPerDay * perPatient</code></td></tr>
            <tr>
              <td>Capture attempts per day</td>
              <td>
                <code>usableImages / (1 - rejectRate)</code> (Acquisition stage carries retake loop).
              </td>
            </tr>
            <tr><td>Acquisition capacity</td><td><code>stations * perStation</code></td></tr>
            <tr>
              <td>Transfer capacity</td>
              <td>
                <code>(bandwidth * 3600 * netHours) / (imgSizeMB * 8)</code>
              </td>
            </tr>
            <tr><td>Inference capacity</td><td><code>modelRate * 1440 * nodes</code></td></tr>
            <tr>
              <td>Review demand</td>
              <td>
                <code>patientsPerDay * referralRate</code>
              </td>
            </tr>
            <tr><td>Review capacity</td><td><code>docs * perDoc</code></td></tr>
            <tr>
              <td>Utilisation</td>
              <td>
                <code>demand / capacity</code> (&gt;1.0 means bottleneck queue forms).
              </td>
            </tr>
            <tr>
              <td>Achievable screening rate</td>
              <td>
                <code>target / max(Utilisation)</code> when <code>max(Utilisation) &gt; 1.0</code>.
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </>
  )
}
