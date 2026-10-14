import { useEffect } from 'react'
import { DEFAULTS, FIELDS, updatePipeline } from '../utils/pipelineModel'

export default function Pipeline() {
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

  return (
    <>
      <h1>Where the screening programme chokes</h1>
      <p className="lede">
        A block model of the whole screening service, from the camera to the
        ophthalmologist. Every stage is drawn with its capacity, the demand placed on it, and the ratio
        between them. The stage where that ratio is highest is the choke point &mdash; it, and nothing
        else, sets how many people the programme can actually screen.
      </p>

      <div className="notice">
        <strong>This is a planning model, not the AI.</strong> Nothing on this page touches a fundus
        image or the classifier. It is the systems-engineering half of the problem: a Simulink-style
        block diagram of the screening service, solved in the browser so the numbers move while you
        change them. The intended production form of this analysis is a Simulink model in MATLAB; this
        is a faithful but lightweight stand-in, and its arithmetic is stated in full at the bottom of
        the page so it can be checked rather than trusted.
      </div>

      <hr className="rule" />

      <section>
        <h2>Signal-flow diagram</h2>
        <p className="small">
          Each block is filled by its utilisation &mdash; demand divided by capacity.
          Wires carry the demand handed from one stage to the next, and thicken with it; where a stage
          cannot meet the demand on its wire, a red badge gives the daily shortfall. The choke point is
          drawn with a heavy outline and labelled, so it is identifiable without relying on colour.
          Everything updates as you change the parameters below.
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
            The bottleneck stage is outlined heavily and labelled as the choke point. The same figures
            are given in the stage table below this diagram.
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

      <div className="model-grid">
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
        <h2>How each figure is worked out</h2>
        <p>
          Nothing here is fitted or randomly simulated. Every capacity is one line of arithmetic on the
          inputs, so the model can be argued with directly.
        </p>

        <table className="matrix">
          <tbody>
            <tr><th>Quantity</th><th>Definition</th></tr>
            <tr><td>Patients per day</td><td>population per year &divide; 365.</td></tr>
            <tr><td>Usable images per day</td><td>patients per day &times; images per patient.</td></tr>
            <tr>
              <td>Capture attempts per day</td>
              <td>
                usable images &divide; (1 &minus; reject rate). A
                rejected capture still occupies the camera, so the acquisition stage carries the retakes and
                no other stage does &mdash; the quality gate runs on the capture device, before upload.
              </td>
            </tr>
            <tr><td>Acquisition capacity</td><td>stations &times; images per station per day.</td></tr>
            <tr>
              <td>Transfer capacity</td>
              <td>
                bandwidth (Mbps) &times; 3600 &times; transfer hours &divide;
                (image size in MB &times; 8). Protocol overhead and retransmission are not modelled, so this
                is an optimistic ceiling.
              </td>
            </tr>
            <tr><td>Inference capacity</td><td>images per minute per node &times; 1440 &times; nodes.</td></tr>
            <tr>
              <td>Review demand</td>
              <td>
                patients per day &times; referral rate. Counted in patients, not
                images: a specialist reviews a person, both eyes at once.
              </td>
            </tr>
            <tr><td>Review capacity</td><td>ophthalmologists &times; reviews per day each.</td></tr>
            <tr>
              <td>Utilisation</td>
              <td>
                demand &divide; capacity at that stage. Above 1.0 the stage cannot
                keep up and a queue forms behind it.
              </td>
            </tr>
            <tr>
              <td>Achievable screening rate</td>
              <td>
                target &divide; the highest utilisation, when that
                exceeds 1.0. A chain runs at the speed of its slowest stage, so one number &mdash; the worst
                utilisation &mdash; sets the whole programme's ceiling.
              </td>
            </tr>
          </tbody>
        </table>

        <h3>What this model leaves out</h3>
        <p className="small">
          It is a steady-state capacity model, so it says nothing about variance: it
          assumes demand arrives evenly, that staff and cameras are available every day they are counted,
          and that no stage fails. Real queues are worse than steady-state ones, because arrivals bunch
          and servers go down &mdash; so wherever this model shows a stage running just under 100%, expect
          a queue in practice. It also treats specialist review as a single pool rather than a rota with
          leave and travel, ignores the time a patient waits between stages, and assumes every flagged
          patient is reviewed exactly once. Read it as a floor on the difficulty, not a forecast.
        </p>
      </section>
    </>
  )
}
