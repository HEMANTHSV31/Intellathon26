# Diabetic Retinopathy Screening Pipeline: MATLAB & Simulink Model

This directory contains the production-grade **Simulink model** and **MATLAB simulation scripts** for the Diabetic Retinopathy clinical screening capacity, choke point diagnostics, and backlog dynamic queueing pipeline.

---

## Why Simulink and MATLAB?

While steady-state capacity arithmetic can run anywhere, real healthcare screening pipelines exhibit:
1. **Dynamic Queue Accumulation**: Unscreened patients queue behind bottleneck stages; in Simulink, this is modeled with bounded continuous/discrete **Integrator** blocks ($\dot{Q} = \max(0, \lambda(t) - \mu(t))$).
2. **Stochastic Arrival Variance**: Real patient intake bunches rather than arriving uniformly. Simulink and MATLAB simulate Poisson and Gaussian arrival surges.
3. **Hardware & Staff Availability**: Simulink allows step, pulse, and state-flow modifications to simulate camera station breakdowns and ophthalmologist leaves.
4. **Closed-Loop Feedback**: Rejected captures at the Quality Gate feed back into the acquisition queue, accurately modeling retake overhead.

---

## Directory Structure

| File | Purpose |
| :--- | :--- |
| [`parameters.m`](file:///d:/Projects/DiabeticRentinopathy/Intellathon26/simulink/parameters.m) | Baseline system parameters (Population target, camera stations, bandwidth, AI inference rate, doctor capacity). |
| [`build_screening_pipeline_model.m`](file:///d:/Projects/DiabeticRentinopathy/Intellathon26/simulink/build_screening_pipeline_model.m) | MATLAB script that **programmatically constructs** the complete `screening_pipeline_model.slx` Simulink diagram with blocks, wirings, scopes, and displays. |
| [`run_screening_simulation.m`](file:///d:/Projects/DiabeticRentinopathy/Intellathon26/simulink/run_screening_simulation.m) | Executes the Simulink model, performs bottleneck diagnostics, and outputs publication-quality MATLAB figures. |
| [`simulate_steady_and_dynamic.m`](file:///d:/Projects/DiabeticRentinopathy/Intellathon26/simulink/simulate_steady_and_dynamic.m) | Vectorized MATLAB solver for dynamic 365-day queueing and Monte Carlo parameter sweeps. |
| [`export_simulation_json.m`](file:///d:/Projects/DiabeticRentinopathy/Intellathon26/simulink/export_simulation_json.m) | Exports MATLAB simulation results to JSON for seamless web stack integration. |

---

## Getting Started in MATLAB

### 1. Open MATLAB and Navigate to this Directory
```matlab
cd('d:/Projects/DiabeticRentinopathy/Intellathon26/simulink');
```

### 2. Generate the Simulink Block Model
Run the builder script to construct the `.slx` block diagram:
```matlab
run('build_screening_pipeline_model.m');
```
This will create and open `screening_pipeline_model.slx` in Simulink.

### 3. Run the Simulation and View Plots
```matlab
run('run_screening_simulation.m');
```
This runs the 365-day time-domain simulation and plots:
- **Stage Utilisation Bar Chart** color-coded by clinical risk level (Green < 75%, Amber 75–95%, Red > 100%).
- **Projected 12-Month Backlog Accumulation Area Chart**.
- **Stage Capacity Ceilings** benchmarked against the target population.

---

## Simulink Subsystems & Signal Flow

```
[Target Population] ---> (Annual to Daily) ---> [Usable Images Demand]
                                                        |
                                          +-------------+-------------+
                                          |                           |
                                          v                           v
                                [Acquisition Stage]         [Network Transfer Stage]
                               (Stations * PerStation)     (Bandwidth * TransferHours)
                                          |                           |
                                          +-------------+-------------+
                                                        |
                                                        v
                                              [AI Inference Stage]
                                          (Rate * 1440 * ComputeNodes)
                                                        |
                                                        v
                                            [Referral Triage Gate]
                                            /                    \
                               (Cleared)   /                      \  (Flagged)
                                          v                        v
                                [Routine Recall]          [Specialist Review]
                                                        (Docs * ReviewsPerDay)
```

---

## Baseline Parameters

- **Target Population**: 100,000 patients/year
- **Images Per Patient**: 2 (one macula-centred field per eye)
- **Acquisition**: 4 camera stations @ 90 images/station/day, 12% reject rate
- **Network**: 10 Mbps bandwidth, 2.0 MB/image, 12 transfer hours/day
- **AI Inference**: 6.0 images/min/node, 1 dedicated compute node (24 h/day)
- **Specialist Review**: 18% referral rate, 1 ophthalmologist @ 60 reviews/day
