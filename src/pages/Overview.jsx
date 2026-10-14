import { Link } from 'react-router-dom'

export default function Overview() {
  return (
    <>
      <h1>Diabetic Retinopathy Screening</h1>
      <p className="lede">
        A clinical screening, explainability and capacity-planning pipeline for fundus photographs,
        running entirely in the browser.
      </p>

      <div className="cta">
        <Link to="/screening">Run it on an image</Link>
        <Link to="/pipeline">See where the programme chokes</Link>
        <Link to="/reference">Clinical reference</Link>
      </div>

      <hr className="rule" />

      <section>
        <h2>The problem</h2>
        <p>
          India has roughly 77 million diabetic adults, and about 18% of them develop diabetic
          retinopathy, a leading cause of preventable blindness. Early screening prevents around 90% of the
          resulting vision loss. The obstacle is not medicine but arithmetic: rural India has roughly one
          ophthalmologist per 100,000 people, so manual screening cannot reach the population that needs it.
        </p>
        <p>
          Automated tools exist, but those deployed so far tend to be opaque, thinly validated, and
          brittle on the inconsistent images that low-cost portable cameras actually produce. This project
          aims at the opposite. Every step shows its working, and every step says plainly what it does not
          know.
        </p>
      </section>

      <hr className="rule" />

      <section>
        <h2>The pipeline</h2>
        <p>
          An image passes through six stages. The two that point at disease do so by unrelated means, and
          are deliberately never merged into a single score. A grading step then applies the published ICDR
          rule to what was found, and raises a referral warning whenever the result should not stand alone.
        </p>

        <svg className="diagram" viewBox="0 0 760 270" role="img"
             aria-label="Six-stage pipeline: quality assessment, then classification, Grad-CAM explainability and lesion detection in parallel, then an ICDR grade and report, with throughput planning alongside.">
          <rect className="box" x="8" y="52" width="118" height="60"/>
          <text className="lbl-b" x="67" y="74" textAnchor="middle">1. Quality</text>
          <text className="lbl-sm" x="67" y="89" textAnchor="middle">focus, exposure,</text>
          <text className="lbl-sm" x="67" y="101" textAnchor="middle">field of view</text>

          <rect className="box" x="8" y="150" width="118" height="40"/>
          <text className="lbl" x="67" y="175" textAnchor="middle">reject, recapture</text>
          <path className="arrow" d="M67 112 L67 150"/><path className="arrow" d="M63 143 L67 150 L71 143"/>
          <text className="lbl-sm" x="90" y="133" textAnchor="start">fail</text>

          <path className="arrow" d="M126 82 L160 82"/><path className="arrow" d="M153 78 L160 82 L153 86"/>
          <text className="lbl-sm" x="143" y="74" textAnchor="middle">pass</text>

          <rect className="box" x="160" y="10" width="150" height="66"/>
          <text className="lbl-b" x="235" y="31" textAnchor="middle">2. Classifier</text>
          <text className="lbl-sm" x="235" y="46" textAnchor="middle">MobileNet, APTOS 2019</text>
          <text className="lbl-sm" x="235" y="58" textAnchor="middle">two classes only</text>
          <text className="lbl-sm" x="235" y="70" textAnchor="middle">runs in the browser</text>

          <rect className="box" x="160" y="92" width="150" height="54"/>
          <text className="lbl-b" x="235" y="113" textAnchor="middle">3. Grad-CAM</text>
          <text className="lbl-sm" x="235" y="128" textAnchor="middle">where the network</text>
          <text className="lbl-sm" x="235" y="140" textAnchor="middle">actually looked</text>

          <rect className="box" x="160" y="162" width="150" height="66"/>
          <text className="lbl-b" x="235" y="183" textAnchor="middle">4. Lesion candidates</text>
          <text className="lbl-sm" x="235" y="198" textAnchor="middle">classical morphology,</text>
          <text className="lbl-sm" x="235" y="210" textAnchor="middle">no machine learning,</text>
          <text className="lbl-sm" x="235" y="222" textAnchor="middle">independent of stage 2</text>

          <path className="arrow" d="M235 76 L235 92"/><path className="arrow" d="M231 85 L235 92 L239 85"/>
          <text className="lbl-sm" x="243" y="88" textAnchor="start">explains</text>
          <path className="arrow" d="M143 82 L143 195 L160 195"/><path className="arrow" d="M153 191 L160 195 L153 199"/>

          <path className="arrow" d="M310 43 L358 43"/><path className="arrow" d="M351 39 L358 43 L351 47"/>
          <path className="arrow" d="M310 119 L358 119"/><path className="arrow" d="M351 115 L358 119 L351 123"/>
          <path className="arrow" d="M310 195 L358 195"/><path className="arrow" d="M351 191 L358 195 L351 199"/>

          <rect className="box" x="358" y="10" width="146" height="218"/>
          <text className="lbl-b" x="431" y="72" textAnchor="middle">5. ICDR grade</text>
          <text className="lbl-sm" x="431" y="89" textAnchor="middle">the published rule,</text>
          <text className="lbl-sm" x="431" y="101" textAnchor="middle">applied to candidates</text>
          <text className="lbl-sm" x="431" y="113" textAnchor="middle">cannot exclude</text>
          <text className="lbl-sm" x="431" y="125" textAnchor="middle">proliferative disease</text>
          <line x1="372" y1="140" x2="490" y2="140" stroke="#000" strokeWidth="1"/>
          <text className="lbl-b" x="431" y="160" textAnchor="middle">Report</text>
          <text className="lbl-sm" x="431" y="176" textAnchor="middle">each result labelled</text>
          <text className="lbl-sm" x="431" y="188" textAnchor="middle">with its own basis</text>
          <text className="lbl-sm" x="431" y="206" textAnchor="middle">refer if in doubt</text>

          <rect className="box-muted" x="556" y="80" width="192" height="80"/>
          <text className="lbl-b" x="652" y="103" textAnchor="middle">6. Throughput planning</text>
          <text className="lbl-sm" x="652" y="120" textAnchor="middle">capacity model, not AI</text>
          <text className="lbl-sm" x="652" y="134" textAnchor="middle">finds the bottleneck stage</text>
          <text className="lbl-sm" x="652" y="148" textAnchor="middle">uses measured model speed</text>
          <path className="arrow" d="M504 119 L556 119"/><path className="arrow" d="M549 115 L556 119 L549 123"/>
        </svg>
        <p className="fig-cap">
          Stages 2 and 4 both point at disease, by unrelated methods. Keeping them apart is
          deliberate: when they disagree, that disagreement is information, and averaging it away would hide it.
        </p>
      </section>

      <hr className="rule" />

      <section>
        <h2>The core idea: telling a lesion from a blood vessel</h2>
        <p>
          This was the hardest part of the project, and the obvious answer is wrong. The instinct is to
          separate lesions from vessels by <em>size</em>, filtering away anything too small or too thin. That
          cannot work, because a microaneurysm is smaller than a blood vessel is wide. Any filter narrow
          enough to remove vessels removes every small lesion along with them. Building it that way was a real
          bug in this project, and it silently discarded the lesions that mattered most.
        </p>
        <p>
          What actually separates them is <em>elongation</em>. A vessel keeps going; a lesion does not. So
          the image is probed along straight lines at twelve orientations. A vessel survives the probe aligned
          with the direction it runs. A round lesion is shorter than the probe in every direction, so every
          orientation catches it.
        </p>

        <svg className="diagram" viewBox="0 0 760 210" role="img"
             aria-label="A vessel survives probing along its own direction; a round lesion is caught by every direction; the macula barely responds because its darkening is gradual.">
          <defs>
            <radialGradient id="mac" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#8f8f8f"/><stop offset="100%" stopColor="#ffffff"/>
            </radialGradient>
          </defs>

          <text className="lbl-b" x="118" y="16" textAnchor="middle">A vessel survives</text>
          <rect className="box" x="18" y="26" width="200" height="140"/>
          <rect x="38" y="92" width="160" height="15" fill="#c9c9c9" stroke="#6b6b6b" strokeWidth="0.5"/>
          <line x1="52" y1="99" x2="184" y2="99" stroke="#000" strokeWidth="3"/>
          <line x1="118" y1="52" x2="118" y2="146" stroke="#000" strokeWidth="2" strokeDasharray="5 4"/>
          <text className="lbl-sm" x="118" y="46" textAnchor="middle">across: leaves the vessel</text>
          <text className="lbl-sm" x="118" y="128" textAnchor="middle">along: stays inside</text>
          <text className="lbl-sm" x="118" y="158" textAnchor="middle">one surviving direction is enough</text>

          <text className="lbl-b" x="380" y="16" textAnchor="middle">A lesion is caught</text>
          <rect className="box" x="280" y="26" width="200" height="140"/>
          <circle cx="380" cy="96" r="17" fill="#c9c9c9" stroke="#6b6b6b" strokeWidth="0.5"/>
          <line x1="330" y1="96" x2="430" y2="96" stroke="#000" strokeWidth="2" strokeDasharray="5 4"/>
          <line x1="380" y1="52" x2="380" y2="140" stroke="#000" strokeWidth="2" strokeDasharray="5 4"/>
          <line x1="348" y1="64" x2="412" y2="128" stroke="#000" strokeWidth="2" strokeDasharray="5 4"/>
          <line x1="412" y1="64" x2="348" y2="128" stroke="#000" strokeWidth="2" strokeDasharray="5 4"/>
          <text className="lbl-sm" x="380" y="158" textAnchor="middle">every direction leaves it: caught</text>

          <text className="lbl-b" x="642" y="16" textAnchor="middle">The macula, for free</text>
          <rect className="box" x="542" y="26" width="200" height="140"/>
          <circle cx="642" cy="94" r="50" fill="url(#mac)"/>
          <text className="lbl-sm" x="642" y="158" textAnchor="middle">a gradual ramp, not an edge</text>
        </svg>
        <p className="fig-cap">
          The same test excludes the macula without being told where the macula is. The
          response depends on how <em>steeply</em> intensity changes, not on how dark something is, so a
          lesion's step edge answers strongly while the macula's gradual darkening barely answers at all.
        </p>
      </section>

      <hr className="rule" />

      <section>
        <h2>What is real, and what is not</h2>
        <p>
          The most common failing in tools of this kind is presenting every output with the same
          confidence, whatever produced it. Here is what each part of this app actually rests on.
        </p>

        <table className="matrix">
          <thead><tr><th>Output</th><th>What it really is</th></tr></thead>
          <tbody>
            <tr><td>Image quality scores</td><td>Real measurements from the pixels. The thresholds are prototype heuristics, not clinically validated cutoffs.</td></tr>
            <tr><td>Disease classification</td><td>Genuine inference from a real MobileNet trained on APTOS 2019, running client-side. <strong>Two classes only</strong>, not a five-level ICDR grade.</td></tr>
            <tr><td>Confidence figures</td><td>Raw softmax outputs. <strong>Not calibrated probabilities.</strong> A reading of 100% is not 100% certainty; it means the image sits far on one side of the decision boundary.</td></tr>
            <tr><td>Grad-CAM</td><td>Real gradients from the loaded model. Coarse by nature, so a region boundary means "somewhere around here", not an outline.</td></tr>
            <tr><td>Lesion candidates</td><td>Classical morphology, no learning, independent of the classifier. <strong>Candidates, not findings.</strong> No accuracy is claimed, because none has been measured against ground truth.</td></tr>
            <tr><td>Severity grade</td><td>The published ICDR rule applied to <strong>unvalidated candidates</strong>. It is what the rule yields if those candidates were confirmed, which is a projection rather than a diagnosis. It <strong>cannot exclude severe or proliferative disease</strong>, because venous beading, IRMA and neovascularisation are all undetectable by this method.</td></tr>
            <tr><td>Sensitivity and specificity</td><td><strong>Not claimed.</strong> No peer-reviewed validation exists for this exact model, so no figures are quoted.</td></tr>
            <tr><td>Throughput simulation</td><td>Arithmetic on your own inputs, with model speed measured live on your device. A planning aid, not a clinical result.</td></tr>
          </tbody>
        </table>

        <p className="notice">
          This is a research and hackathon prototype. It is not a certified medical device,
          and nothing it produces is a diagnosis.
        </p>
      </section>

      <hr className="rule" />

      <section>
        <h2>Project layout</h2>
        <table className="matrix">
          <tbody>
            <tr><td><code>Overview</code></td><td>This overview.</td></tr>
            <tr><td><code>Run screening</code></td><td>The working application: upload, pipeline, results, printable report.</td></tr>
            <tr><td><code>Clinical reference</code></td><td>ICDR severity scale, lesion vocabulary, and how the system reaches a conclusion.</td></tr>
            <tr><td><code>Capacity model</code></td><td>Signal-flow capacity model of the screening programme.</td></tr>
          </tbody>
        </table>
        <div className="cta"><Link to="/screening">Run it on an image</Link></div>
      </section>
    </>
  )
}
