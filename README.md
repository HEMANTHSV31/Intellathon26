# Diabetic Retinopathy Screening System

A modern full-stack clinical screening, explainability, and capacity planning application for diabetic retinopathy fundus image analysis.

## Architecture

- **Frontend**: React 19, Vite, React Router DOM, TensorFlow.js (MobileNet binary DR classifier & Grad-CAM visual explainability, classical lesion detection, ICDR grading rules).
- **Backend / Authentication**: Node.js, Express, PostgreSQL (Supabase), bcryptjs (salted password hashing), JSON Web Tokens (JWT) for secure session persistence.
- **Capacity Planning**: Simulink-style interactive service capacity block model running client-side.

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
