%% PARAMETERS FOR DIABETIC RETINOPATHY SCREENING CAPACITY PIPELINE
% Intellathon26 - Systems Engineering Clinical Capacity Model
% Compatible with MATLAB R2020a through R2026a / Simulink

clear; clc;

%% 1. Demand Parameters
params.target         = 100000;    % Population to screen per year (patients/year)
params.perPatient     = 2;         % Fundus images captured per patient (1 macula-centred field per eye)

%% 2. Acquisition Parameters (Fundus Cameras at Primary Health Centres)
params.stations       = 4;         % Number of active camera stations
params.perStation     = 90;        % Maximum capture attempts per station per day
params.rejectPct      = 12;        % Quality reject rate (%) - retakes load camera stations

%% 3. Network Transfer Parameters (PHC Uplink to Cloud/Central Server)
params.bandwidth      = 10;        % Available link bandwidth in Mbps
params.imgSizeMB      = 2.0;       % Average fundus image file size (MB)
params.netHours       = 12;        % Active transfer window (hours/day)

%% 4. AI Inference Parameters (Deep Learning MobileNet DR Classifier + Explainability)
params.modelRate      = 6.0;       % Inference throughput (images/minute/node)
params.nodes          = 1;         % Number of dedicated inference nodes (runs 24 h/day)

%% 5. Specialist Clinical Review Parameters (Ophthalmologist Grading)
params.referralPct    = 18;        % Referral rate (%) - automated triage gate
params.docs           = 1;         % Ophthalmologists available for secondary review
params.perDoc         = 60;        % Maximum patient reviews per ophthalmologist per day

%% 6. Simulation Horizon & Solver Settings
params.simDays        = 365;       % Simulation duration (1 year = 365 days)
params.dt             = 1.0;       % Discrete step size (days)
params.stochasticVar  = 0.15;      % Relative variance for Monte Carlo / Poisson arrival surge (15%)

% Save to workspace for Simulink block model consumption
fprintf('==> Loaded Screening Pipeline Parameters into MATLAB Workspace.\n');
fprintf('    Target Population: %s patients/year\n', num2str(params.target));
fprintf('    Camera Stations:   %d (Capacity: %d images/day)\n', params.stations, params.stations * params.perStation);
fprintf('    Link Bandwidth:    %0.1f Mbps (%0.1f h/day)\n', params.bandwidth, params.netHours);
fprintf('    AI Inference Rate: %0.1f images/min (%d nodes)\n', params.modelRate, params.nodes);
fprintf('    Ophthalmologists:  %d (Capacity: %d reviews/day)\n', params.docs, params.docs * params.perDoc);
