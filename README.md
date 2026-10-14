# Diabetic Retinopathy Screening System

A modern full-stack clinical screening, explainability, and capacity planning application for diabetic retinopathy fundus image analysis.

## Architecture

- **Frontend**: React 19, Vite, React Router DOM, TensorFlow.js (MobileNet binary DR classifier & Grad-CAM visual explainability, classical lesion detection, ICDR grading rules).
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

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and fill in your Supabase PostgreSQL credentials:
```bash
cp .env.example .env
```

### 3. Start the Authentication Server
```bash
npm run server
```
The authentication server runs on port 3001.

### 4. Start the Vite Frontend Dev Server
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

## Production Build
```bash
npm run build
```
Build output is generated in `dist/`.
