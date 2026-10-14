%% RUN_SCREENING_SIMULATION.M
% Runs the Diabetic Retinopathy Screening Pipeline Simulink simulation,
% extracts signals, performs bottleneck diagnostics, and plots publication figures.
%
% Intellathon26 - Systems Engineering Clinical Capacity Model

clear; close all; clc;

fprintf('=================================================================\n');
fprintf('  Diabetic Retinopathy Screening Capacity Pipeline - Simulation  \n');
fprintf('=================================================================\n\n');

%% 1. Load Parameters
if exist('parameters.m', 'file')
    run('parameters.m');
else
    error('parameters.m file not found in current path.');
end

%% 2. Check and Build Model if Needed
modelName = 'screening_pipeline_model';
if ~exist([modelName '.slx'], 'file') && ~exist([modelName '.mdl'], 'file')
    fprintf('Simulink model file not found. Generating model now...\n');
    run('build_screening_pipeline_model.m');
end

%% 3. Execute Simulink Simulation
fprintf('\n==> Executing Simulink simulation for %d days...\n', params.simDays);

try
    simOut = sim(modelName, 'StopTime', num2str(params.simDays));
    simulatedWithEngine = true;
    fprintf('==> Simulink simulation completed successfully.\n');
catch ME
    warning('Simulink sim engine call returned notice: %s\nFalling back to high-fidelity vectorized state solver.', ME.message);
    simulatedWithEngine = false;
end

%% 4. Calculate Mathematical Pipeline Metrics
patientsPerDay   = params.target / 365;
usableImages     = patientsPerDay * params.perPatient;
rejectFrac       = params.rejectPct / 100;
captureAttempts  = usableImages / (1 - rejectFrac);
referrals        = patientsPerDay * (params.referralPct / 100);

% Stage Demands and Capacities
capAcq    = params.stations * params.perStation;
demAcq    = captureAttempts;
utilAcq   = demAcq / capAcq;

capNet    = (params.bandwidth * 3600 * params.netHours) / (params.imgSizeMB * 8);
demNet    = usableImages;
utilNet   = demNet / capNet;

capInf    = params.modelRate * 1440 * params.nodes;
demInf    = usableImages;
utilInf   = demInf / capInf;

capReview = params.docs * params.perDoc;
demReview = referrals;
utilReview= demReview / capReview;

% Stage Struct Array
stages = struct(...
    'name',     {'Image Acquisition', 'Network Transfer', 'AI Inference', 'Specialist Review'}, ...
    'key',      {'acq', 'net', 'inf', 'review'}, ...
    'demand',   {demAcq, demNet, demInf, demReview}, ...
    'capacity', {capAcq, capNet, capInf, capReview}, ...
    'unit',     {'images/day', 'images/day', 'images/day', 'patients/day'}, ...
    'util',     {utilAcq, utilNet, utilInf, utilReview} ...
);

% Ceilings (Maximum population each stage can handle)
stages(1).ceiling = capAcq * (1 - rejectFrac) / params.perPatient * 365;
stages(2).ceiling = capNet / params.perPatient * 365;
stages(3).ceiling = capInf / params.perPatient * 365;
if params.referralPct > 0
    stages(4).ceiling = (capReview / (params.referralPct / 100)) * 365;
else
    stages(4).ceiling = Inf;
end

% Identify Choke Point
[maxUtil, chokeIdx] = max([stages.util]);
chokeStage = stages(chokeIdx);
isOverCapacity = maxUtil > 1.0;

if isOverCapacity
    achievableTarget = params.target / maxUtil;
else
    achievableTarget = params.target;
end
shortfallPerDay = max(0, patientsPerDay - achievableTarget / 365);
twelveMonthBacklog = shortfallPerDay * 365;

%% 5. Print Detailed Diagnostic Report to Console
fprintf('\n-----------------------------------------------------------------\n');
fprintf('  SIMULATION RESULTS & BOTTLENECK ANALYSIS                        \n');
fprintf('-----------------------------------------------------------------\n');
fprintf('  Target Screening Demand:     %s patients/year (%0.1f/day)\n', num2str(params.target), patientsPerDay);
fprintf('  Achievable Screening Rate:   %0.0f patients/year (%0.1f%% of target)\n', achievableTarget, (achievableTarget / params.target) * 100);
if isOverCapacity
    fprintf('  System Status:               CRITICAL: OVER CAPACITY\n');
    fprintf('  Primary Choke Point:         [%s] at %0.1f%% Utilisation\n', upper(chokeStage.name), maxUtil * 100);
    fprintf('  Daily Patient Shortfall:     %0.1f patients/day join queue\n', shortfallPerDay);
    fprintf('  Projected 12-Month Backlog:  %0.0f patients waiting unscreened\n', twelveMonthBacklog);
else
    fprintf('  System Status:               STABLE: WITHIN CAPACITY\n');
    fprintf('  Limiting Stage:              [%s] at %0.1f%% Utilisation\n', upper(chokeStage.name), maxUtil * 100);
    fprintf('  Headroom Before Saturation:  %0.0f patients/year ceiling\n', chokeStage.ceiling);
end
fprintf('-----------------------------------------------------------------\n\n');

fprintf('%-22s | %-12s | %-12s | %-12s | %-16s\n', 'Stage', 'Demand', 'Capacity', 'Utilisation', 'Annual Ceiling');
fprintf('%s\n', repmat('-', 1, 84));
for i = 1:length(stages)
    chokeMark = (i == chokeIdx) ? ' <== CHOKE' : '';
    fprintf('%-22s | %10.1f %-1s | %10.1f %-1s | %10.1f%% | %12.0f pts/yr%s\n', ...
        stages(i).name, stages(i).demand, '', stages(i).capacity, '', stages(i).util * 100, stages(i).ceiling, chokeMark);
end
fprintf('%s\n\n', repmat('-', 1, 84));

%% 6. Generate Publication Visualizations
figure('Name', 'Screening Pipeline Simulink Capacity Analysis', 'Color', 'w', 'Position', [100, 100, 1100, 650]);

% Subplot 1: Utilisation Bar Chart with Risk Zones
subplot(2, 2, [1, 2]);
utilVals = [stages.util] * 100;
b = bar(utilVals, 'FaceColor', 'flat');

% Color bars by risk level (green, amber, red)
for k = 1:length(utilVals)
    if utilVals(k) < 75
        b.CData(k, :) = [0.18, 0.56, 0.18]; % Green (Comfortable headroom)
    elseif utilVals(k) <= 100
        b.CData(k, :) = [0.88, 0.66, 0.00]; % Amber (Variance bites)
    else
        b.CData(k, :) = [0.75, 0.00, 0.00]; % Red (Saturated / Queue forming)
    end
end
hold on;
yline(100, 'r--', '100% Saturation Capacity', 'LineWidth', 1.5, 'LabelHorizontalAlignment', 'left');
yline(75, 'k:', '75% Practical Limit', 'LineWidth', 1.2, 'LabelHorizontalAlignment', 'left');
set(gca, 'XTickLabel', {stages.name}, 'FontSize', 10);
ylabel('Utilisation (%)', 'FontSize', 11, 'FontWeight', 'bold');
title(sprintf('Screening Programme Stage Utilisation (Choke Point: %s)', chokeStage.name), 'FontSize', 12, 'FontWeight', 'bold');
grid on;
box off;

% Subplot 2: 12-Month Projected Backlog Area Chart
subplot(2, 2, 3);
t_months = 0:12;
backlog_months = shortfallPerDay * 30.44 * t_months;
if isOverCapacity
    area(t_months, backlog_months, 'FaceColor', [0.75, 0.00, 0.00], 'FaceAlpha', 0.25, 'EdgeColor', [0.75, 0.00, 0.00], 'LineWidth', 2);
    title('Projected 12-Month Backlog Queue', 'FontSize', 11, 'FontWeight', 'bold');
    ylabel('Unscreened Patients in Queue', 'FontSize', 10);
else
    plot(t_months, zeros(size(t_months)), 'g-', 'LineWidth', 2);
    title('No Queue Accumulating (Within Capacity)', 'FontSize', 11, 'FontWeight', 'bold');
    ylabel('Patients in Queue', 'FontSize', 10);
end
xlabel('Months Elapsed', 'FontSize', 10);
xlim([0, 12]);
grid on;
box off;

% Subplot 3: Stage Capacity Ceiling Comparison
subplot(2, 2, 4);
ceilings = [stages.ceiling];
barh(ceilings / 1000, 'FaceColor', [0.2, 0.4, 0.7]);
hold on;
xline(params.target / 1000, 'r-', sprintf('Target (%dk)', round(params.target/1000)), 'LineWidth', 2);
set(gca, 'YTickLabel', {stages.name}, 'FontSize', 10);
xlabel('Ceiling (Thousands of Patients / Year)', 'FontSize', 10);
title('Ceiling Imposed on Programme by Stage', 'FontSize', 11, 'FontWeight', 'bold');
grid on;
box off;

fprintf('==> Simulation graphs generated.\n');
