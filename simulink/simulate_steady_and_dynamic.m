function results = simulate_steady_and_dynamic(customParams)
%% SIMULATE_STEADY_AND_DYNAMIC
% Solves both the steady-state clinical capacity model and dynamic 365-day
% discrete time queuing simulation with stochastic arrival surges and retake feedback.
%
% Usage:
%   res = simulate_steady_and_dynamic();
%   res = simulate_steady_and_dynamic(struct('target', 120000, 'docs', 2));
%
% Intellathon26 - Systems Engineering Clinical Capacity Model

if nargin < 1 || isempty(customParams)
    p.target         = 100000;
    p.perPatient     = 2;
    p.stations       = 4;
    p.perStation     = 90;
    p.rejectPct      = 12;
    p.bandwidth      = 10;
    p.imgSizeMB      = 2.0;
    p.netHours       = 12;
    p.modelRate      = 6.0;
    p.nodes          = 1;
    p.referralPct    = 18;
    p.docs           = 1;
    p.perDoc         = 60;
    p.simDays        = 365;
    p.stochasticVar  = 0.15;
else
    p = customParams;
end

%% 1. Steady-State Calculation
patientsPerDay   = p.target / 365;
usableImages     = patientsPerDay * p.perPatient;
rejectFrac       = p.rejectPct / 100;
captureAttempts  = usableImages / (1 - rejectFrac);
referrals        = patientsPerDay * (p.referralPct / 100);

capAcq    = p.stations * p.perStation;
demAcq    = captureAttempts;
utilAcq   = demAcq / capAcq;

capNet    = (p.bandwidth * 3600 * p.netHours) / (p.imgSizeMB * 8);
demNet    = usableImages;
utilNet   = demNet / capNet;

capInf    = p.modelRate * 1440 * p.nodes;
demInf    = usableImages;
utilInf   = demInf / capInf;

capReview = p.docs * p.perDoc;
demReview = referrals;
utilReview= demReview / capReview;

if p.referralPct > 0
    reviewCeiling = (capReview / (p.referralPct / 100)) * 365;
else
    reviewCeiling = Inf;
end

stages = [
    struct('key', 'acq',    'name', 'Image Acquisition', 'demand', demAcq,    'capacity', capAcq,    'util', utilAcq,    'ceiling', capAcq * (1 - rejectFrac) / p.perPatient * 365);
    struct('key', 'net',    'name', 'Network Transfer',  'demand', demNet,    'capacity', capNet,    'util', utilNet,    'ceiling', capNet / p.perPatient * 365);
    struct('key', 'inf',    'name', 'AI Inference',      'demand', demInf,    'capacity', capInf,    'util', utilInf,    'ceiling', capInf / p.perPatient * 365);
    struct('key', 'review', 'name', 'Specialist Review', 'demand', demReview, 'capacity', capReview, 'util', utilReview, 'ceiling', reviewCeiling)
];

[maxUtil, chokeIdx] = max([stages.util]);
choke = stages(chokeIdx);
isOver = maxUtil > 1.0;
if isOver
    achievable = p.target / maxUtil;
else
    achievable = p.target;
end
shortfallDaily = max(0, patientsPerDay - achievable / 365);

%% 2. Dynamic 365-Day Queuing Simulation (Simulink Equivalent)
days = p.simDays;
t = 1:days;

% Daily arrival variation (Stochastic Poisson-approximated Gaussian surges)
rng(42); % Deterministic seed for reproducible testing
dailySurge = 1 + p.stochasticVar * randn(1, days);
dailySurge(dailySurge < 0.2) = 0.2; % Lower bound

dailyPatientArrivals = patientsPerDay * dailySurge;
dailyUsableImages = dailyPatientArrivals * p.perPatient;
dailyCaptureAttempts = dailyUsableImages / (1 - rejectFrac);
dailyReferrals = dailyPatientArrivals * (p.referralPct / 100);

% State variables: queues for each stage (integrators with lower bound 0)
qAcq = zeros(1, days);
qNet = zeros(1, days);
qInf = zeros(1, days);
qReview = zeros(1, days);

currQAcq = 0; currQNet = 0; currQInf = 0; currQReview = 0;

for d = 1:days
    % Acquisition
    netFlowAcq = dailyCaptureAttempts(d) - capAcq;
    currQAcq = max(0, currQAcq + netFlowAcq);
    qAcq(d) = currQAcq;

    % Network
    netFlowNet = dailyUsableImages(d) - capNet;
    currQNet = max(0, currQNet + netFlowNet);
    qNet(d) = currQNet;

    % Inference
    netFlowInf = dailyUsableImages(d) - capInf;
    currQInf = max(0, currQInf + netFlowInf);
    qInf(d) = currQInf;

    % Review
    netFlowReview = dailyReferrals(d) - capReview;
    currQReview = max(0, currQReview + netFlowReview);
    qReview(d) = currQReview;
end

%% Package Output Results
results.params               = p;
results.patientsPerDay       = patientsPerDay;
results.usableImages         = usableImages;
results.captureAttempts      = captureAttempts;
results.referrals            = referrals;
results.stages               = stages;
results.choke                = choke;
results.maxUtil              = maxUtil;
results.isOverCapacity       = isOver;
results.achievableTarget     = achievable;
results.shortfallPerDay      = shortfallDaily;
results.twelveMonthBacklog   = shortfallDaily * 365;

% Dynamic Time Series
results.timeDays             = t;
results.dynamicQueues.acq    = qAcq;
results.dynamicQueues.net    = qNet;
results.dynamicQueues.inf    = qInf;
results.dynamicQueues.review = qReview;

end
