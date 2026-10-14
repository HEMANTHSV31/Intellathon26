# Diabetic Retinopathy Screening System

A modern full-stack clinical screening, explainability, and capacity planning application for diabetic retinopathy fundus image analysis.

## Branch: `matlab-lesion-detection`

This branch integrates the **MATLAB Image Processing & Morphology Suite** into the lesion candidate detection stage (Step 4) to improve detection accuracy, eliminate vessel false positives, and ensure medical-grade precision across microaneurysms, blot hemorrhages, hard exudates, and cotton wool spots.

---

## Architecture & Tech Stack

- **Frontend**: React 19, Vite, React Router DOM, TensorFlow.js (MobileNet binary DR classifier & Grad-CAM visual explainability, classical ICDR grading rules).
- **Lesion Detection Tech Stack (MATLAB Engine)**:
  - **MATLAB Suite (`matlab/+dr/`)**: 41 modular MATLAB image processing algorithms covering 12-orientation directional top-hat morphology, multi-scale saturation ladders, ray-tracing vessel junction filters, and quadrant accounting.
  - **MATLAB CLI (`matlab/detectLesionsCli.m`)**: Headless batch execution interface for automated screening workflows (`matlab -batch "detectLesionsCli('input.jpg', 'output.json')"`).
  - **Node.js MATLAB Bridge (`server/matlabBridge.cjs`)**: Backend API service exposing `/api/matlab/status` and `/api/matlab/detect-lesions` with automatic detection of host MATLAB/Octave runtimes and fallback to the high-accuracy morphology implementation.
- **Backend / Authentication**: Node.js, Express, PostgreSQL (Supabase), bcryptjs (salted password hashing), JSON Web Tokens (JWT) for secure session persistence.
- **Capacity Planning**: MATLAB & Simulink clinical throughput block diagram, 365-day dynamic integrator queuing simulation, and programmatic `.slx` model generator (located in `simulink/`).

## MATLAB & Simulink Model

The repository provides a complete systems-engineering capacity and queuing model for MATLAB / Simulink in the `simulink/` directory:

- `simulink/parameters.m`: Workspace parameters configuration.
- `simulink/build_screening_pipeline_model.m`: Programmatically creates `screening_pipeline_model.slx` in Simulink with scopes, displays, and wiring.
- `simulink/run_screening_simulation.m`: Runs the dynamic simulation, identifies the primary choke point, and renders publication-ready MATLAB figures.
- `simulink/simulate_steady_and_dynamic.m`: Vectorized MATLAB solver for dynamic continuous integrators ($\dot{Q}(t) = \max(0, \lambda(t) - \mu(t))$) with arrival variance.
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

## MATLAB Lesion Detection Features

1. **Directional Top-Hat Morphology**:
   - Linear structuring elements evaluated across 12 discrete angles (0° to 165°).
   - Separates isotropic round structures (microaneurysms, blot hemorrhages) from anisotropic linear structures (vessels).
2. **Multi-Scale Saturation Ladder**:
   - Geometrically expanding structuring element sizes ($se_k = se_0 \times 1.4^k$) distinguish true bounded lesions from expanding vessel crossings and bifurcations.
3. **Ray-Tracing Vessel Collar Analysis**:
   - 24 angular radial rays tracing vessel persistence beyond candidate collars, eliminating false positives at vessel junctions.
4. **Contrast & Edge Sharpness Separation**:
   - Sharp edge gradient thresholding cleanly categorizes hard exudates (HE) from soft-edged cotton wool spots (CWS).

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create `.env` with your Supabase PostgreSQL credentials and optional MATLAB path:
```env
PORT=3001
JWT_SECRET=your_jwt_secret
DATABASE_URL=postgresql://user:password@host:5432/postgres
MATLAB_PATH=matlab
```

### 3. Start Backend & MATLAB API Server
```bash
npm run server
```
The server runs on `http://127.0.0.1:3001` and provides:
- Authentication (`/api/auth/*`)
- MATLAB status & detection (`/api/matlab/status`, `/api/matlab/detect-lesions`)

### 4. Start Vite Frontend Dev Server
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## Running MATLAB Standalone Pipeline

To run the reference MATLAB pipeline directly from MATLAB R2023b+:
```matlab
addpath('matlab');
detectLesionsCli('path/to/fundus.jpg', 'output.json');
```
Or run the full multi-stage pipeline:
```matlab
addpath('matlab');
R = dr.runPipeline('path/to/fundus.jpg', Render=true);
disp(dr.writeReport(R));
imshow(R.panels.lesionOverlay);
```

---

## Production Build
```bash
npm run build
```
Build output is generated in `dist/`.
