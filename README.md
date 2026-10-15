# RetiScan: Clinical Diabetic Retinopathy Screening & Triage Platform

An end-to-end, tele-ophthalmology screening, explainability, clinical triage, and capacity planning platform for diabetic retinopathy (DR) fundus image analysis — engineered for rural health camps and hospital referral networks.

---

## System Overview & Core Capabilities

RetiScan bridges primary rural health workers and specialist ophthalmologists through an integrated, offline-resilient screening workflow:

1. **📶 Zero-Connectivity Offline PWA**:
   - Progressive Web App with service worker pre-caching for all shell assets, TensorFlow.js runtime, and the full neural network binary weight shards (`group1-shard1of4.bin` through `shard4of4.bin`, ~12.9 MB).
   - Operators can screen patients and execute AI inference in deep rural areas with zero internet connectivity.

2. **🌐 Comprehensive Multilingual Support (9 Indian Languages)**:
   - Full localized user interface supporting **Hindi (हिन्दी), Kannada (ಕನ್ನಡ), Marathi (मराठी), Tamil (தமிழ்), Telugu (తెలుగు), Malayalam (മലയാളം), Bengali (বাংলা), Gujarati (ગુજરાતી), and English**.
   - Dual-engine translation: high-speed client-side clinical dictionary for instant metrics and clinical staging labels, paired with dynamic DOM translation for long educational content.

3. **👨‍⚕️ Specialist Ophthalmology Triage & Staging Override Queue**:
   - Urgency-based patient triage queue sorted by clinical severity (High / Moderate / Low) and referral urgency.
   - Side-by-side bilateral fundus inspection (OD - Right Eye & OS - Left Eye) with Grad-CAM heatmap overlays and lesion bounding boxes.
   - Specialist clinical notes editor and ability to override automated AI classifications with confirmed diagnosis.

4. **📄 Medico-Legal Clinical PDF Report Export**:
   - One-click formal tele-retinopathy summary modal featuring clinic header, patient demographics, examination timestamp, bilateral fundus thumbnails, ICDR stage comparison, and doctor attestation sign-off block.
   - Native browser print-to-PDF layout and standalone HTML report downloads.

5. **🔬 Multi-Stage Lesion Detection (MATLAB Morphology Suite)**:
   - 41 modular MATLAB image processing algorithms: 12-orientation directional top-hat morphology, multi-scale saturation ladders, ray-tracing vessel junction filters, and quadrant lesion accounting.
   - Node.js backend bridge (`server/matlabBridge.cjs`) with automatic detection of host MATLAB/Octave runtimes and graceful JS morphology fallback.

6. **📈 Systems-Engineering Capacity Planning (MATLAB & Simulink)**:
   - Dynamic 365-day continuous integrator queuing simulation ($\dot{Q}(t) = \max(0, \lambda(t) - \mu(t))$) modeling screening camp bottlenecks, referral backlogs, and doctor review capacity.

7. **🔐 Cloud Database & 1-Click Demo Evaluation**:
   - PostgreSQL (Supabase) schema with automated migrations and pre-seeded staff credentials for instant evaluator logins without manual registration.

---

## Technology Stack

- **Client**: React 19, Vite, React Router DOM, Vanilla CSS design tokens (clinical teal/slate palette).
- **Edge AI & Explainability**: TensorFlow.js (MobileNet feature extractor, Grad-CAM visual heatmaps, classical ICDR rules engine).
- **Backend & Database**: Node.js, Express, PostgreSQL (Supabase), bcryptjs, JSON Web Tokens (JWT).
- **Morphology & Capacity Modeling**: MATLAB R2023b+, Simulink, programmatic `.slx` generator.

---

## 1-Click Evaluation Credentials

The application includes pre-seeded demo accounts in the PostgreSQL database for instant evaluator access:

| Role | Email | Password | Access Level |
|---|---|---|---|
| **Ophthalmologist** | `dr.sharma@hospital.org` | `password123` | Patient Triage Queue, Notes, Grade Override, PDF Reports |
| **Field Operator** | `operator.vikram@clinic.org` | `password123` | Patient Intake, Image Screening, Metadata Sync, PWA Cache |
| **Administrator** | `admin.retina@health.gov` | `password123` | System Audit Log, Cross-Center Screening Search, Data Export |
| **Patient Portal** | *Single input (e.g. `Hemanth 9876543210`)* | *No password required* | Personal Bilateral Scans, Diagnosis, Tele-Report Download |

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the project root:
```env
PORT=3001
JWT_SECRET=your_jwt_secret_key_here
DATABASE_URL=postgresql://user:password@host:5432/postgres
MATLAB_PATH=matlab
```
*(If `DATABASE_URL` is omitted, the backend runs in resilient fallback mode).*

### 3. Start Backend API Server
```bash
npm run server
```
The server runs on `http://127.0.0.1:3001` and initializes the PostgreSQL tables and demo accounts automatically.

### 4. Start Frontend Client
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## MATLAB & Simulink Model

The repository provides a complete systems-engineering capacity and queuing model in the `simulink/` directory:

- `simulink/parameters.m`: Workspace parameters configuration.
- `simulink/build_screening_pipeline_model.m`: Programmatically creates `screening_pipeline_model.slx` in Simulink with scopes, displays, and wiring.
- `simulink/run_screening_simulation.m`: Runs dynamic simulation, identifies primary choke points, and renders publication-ready figures.
- `simulink/simulate_steady_and_dynamic.m`: Vectorized MATLAB solver for dynamic continuous integrators.
- `simulink/export_simulation_json.m`: Exports simulation data to JSON for web consumption.

### Running in MATLAB:
```matlab
cd('simulink');
run('parameters.m');
run('build_screening_pipeline_model.m');
sim('screening_pipeline_model');
run('run_screening_simulation.m');
```

---

## Running MATLAB Standalone Pipeline

To run the reference MATLAB morphology pipeline directly from MATLAB R2023b+:
```matlab
addpath('matlab');
detectLesionsCli('path/to/fundus.jpg', 'output.json');
```
Or run the complete pipeline with interactive overlay visualization:
```matlab
addpath('matlab');
R = dr.runPipeline('path/to/fundus.jpg', Render=true);
disp(dr.writeReport(R));
imshow(R.panels.lesionOverlay);
```

---

## Production Build & PWA Testing

To create the optimized production bundle:
```bash
npm run build
```
Build output is saved to `dist/`. The Service Worker in `public/sw.js` will intercept requests and serve the complete app and weight shards offline.
