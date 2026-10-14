%% BUILD_SCREENING_PIPELINE_MODEL.M
% Programmatically constructs the complete Diabetic Retinopathy Screening
% Capacity Planning Simulink Model (.slx) in MATLAB.
%
% Intellathon26 - Systems Engineering Clinical Capacity Model
% Works with MATLAB / Simulink R2020a - R2026a
%
% Usage in MATLAB:
%   >> run('parameters.m');
%   >> run('build_screening_pipeline_model.m');
%   >> sim('screening_pipeline_model');

fprintf('\n=======================================================\n');
fprintf('  Building Simulink Model: screening_pipeline_model    \n');
fprintf('=======================================================\n');

% 1. Ensure parameters are in workspace
if ~exist('params', 'var')
    if exist('parameters.m', 'file')
        run('parameters.m');
    else
        error('parameters.m not found. Please ensure it is in the same directory.');
    end
end

modelName = 'screening_pipeline_model';

% 2. Close if already open without saving changes
if bdIsLoaded(modelName)
    close_system(modelName, 0);
end

% 3. Create fresh new system
new_system(modelName);
open_system(modelName);

% Configure Simulation Parameters
set_param(modelName, 'StopTime', num2str(params.simDays));
set_param(modelName, 'Solver', 'ode45');
set_param(modelName, 'SolverType', 'Variable-step');
set_param(modelName, 'SaveTime', 'on', 'TimeSaveName', 'tout');
set_param(modelName, 'SaveOutput', 'on', 'OutputSaveName', 'yout');

%% -------------------------------------------------------------
%% Add Blocks: Parameter Sources
%% -------------------------------------------------------------
% Patient Target Demand (patients/year)
add_block('simulink/Sources/Constant', [modelName '/Target_Population'], ...
    'Value', 'params.target', ...
    'Position', [30, 40, 110, 70]);

% Images Per Patient
add_block('simulink/Sources/Constant', [modelName '/Images_Per_Patient'], ...
    'Value', 'params.perPatient', ...
    'Position', [30, 100, 110, 130]);

% Convert Annual Target to Daily Patient Rate (Divide by 365)
add_block('simulink/Math Operations/Gain', [modelName '/Annual_To_Daily_Rate'], ...
    'Gain', '1/365', ...
    'Position', [150, 42, 210, 68]);

% Multiply Daily Patients by Images Per Patient -> Usable Images / Day
add_block('simulink/Math Operations/Product', [modelName '/Compute_Usable_Images'], ...
    'Inputs', '2', ...
    'Position', [250, 45, 280, 105]);

%% -------------------------------------------------------------
%% Add Blocks: Acquisition Stage & Quality Rejection Feedback
%% -------------------------------------------------------------
% Reject Rate Constant (e.g. 0.12)
add_block('simulink/Sources/Constant', [modelName '/Reject_Fraction'], ...
    'Value', 'params.rejectPct / 100', ...
    'Position', [30, 170, 110, 200]);

% Compute 1 / (1 - RejectPct/100) for Capture Attempts multiplier
add_block('simulink/Math Operations/Math Function', [modelName '/One_Minus_Reject'], ...
    'Function', 'reciprocal', ...
    'Position', [250, 170, 290, 200]);

add_block('simulink/Math Operations/Sum', [modelName '/Complement_Reject'], ...
    'Inputs', '+-', ...
    'Position', [160, 172, 190, 198]);

add_block('simulink/Sources/Constant', [modelName '/One_Const'], ...
    'Value', '1', ...
    'Position', [120, 160, 140, 180]);

% Capture Attempts Demand = Usable Images * (1 / (1 - rejectPct))
add_block('simulink/Math Operations/Product', [modelName '/Capture_Attempts_Demand'], ...
    'Inputs', '2', ...
    'Position', [340, 70, 370, 120]);

% Acquisition Capacity = Stations * PerStation (images/day)
add_block('simulink/Sources/Constant', [modelName '/Acq_Capacity'], ...
    'Value', 'params.stations * params.perStation', ...
    'Position', [340, 150, 420, 180]);

% Acquisition Utilisation = Demand / Capacity
add_block('simulink/Math Operations/Divide', [modelName '/Acq_Utilisation'], ...
    'Inputs', '*/', ...
    'Position', [460, 85, 490, 135]);

% Acquisition Shortfall Rate = max(0, Demand - Capacity)
add_block('simulink/Math Operations/Sum', [modelName '/Acq_Shortfall_Diff'], ...
    'Inputs', '+-', ...
    'Position', [460, 160, 490, 190]);

add_block('simulink/Discontinuities/Saturation', [modelName '/Acq_Shortfall_Sat'], ...
    'LowerLimit', '0', ...
    'UpperLimit', 'inf', ...
    'Position', [520, 165, 550, 185]);

% Acquisition Backlog Integrator (Patients unmet accumulating over time)
add_block('simulink/Continuous/Integrator', [modelName '/Acq_Backlog_Integrator'], ...
    'InitialCondition', '0', ...
    'LimitOutput', 'on', ...
    'LowerSaturationLimit', '0', ...
    'UpperSaturationLimit', 'inf', ...
    'Position', [590, 160, 620, 190]);

%% -------------------------------------------------------------
%% Add Blocks: Network Transfer Stage
%% -------------------------------------------------------------
% Network Capacity (images/day) = (Bandwidth * 3600 * NetHours) / (ImgSizeMB * 8)
add_block('simulink/Sources/Constant', [modelName '/Net_Capacity'], ...
    'Value', '(params.bandwidth * 3600 * params.netHours) / (params.imgSizeMB * 8)', ...
    'Position', [340, 240, 460, 270]);

% Network Utilisation = Usable Images Demand / Net Capacity
add_block('simulink/Math Operations/Divide', [modelName '/Net_Utilisation'], ...
    'Inputs', '*/', ...
    'Position', [510, 220, 540, 270]);

% Network Shortfall
add_block('simulink/Math Operations/Sum', [modelName '/Net_Shortfall_Diff'], ...
    'Inputs', '+-', ...
    'Position', [510, 285, 540, 315]);

add_block('simulink/Discontinuities/Saturation', [modelName '/Net_Shortfall_Sat'], ...
    'LowerLimit', '0', ...
    'UpperLimit', 'inf', ...
    'Position', [565, 290, 595, 310]);

add_block('simulink/Continuous/Integrator', [modelName '/Net_Backlog_Integrator'], ...
    'InitialCondition', '0', ...
    'LimitOutput', 'on', ...
    'LowerSaturationLimit', '0', ...
    'Position', [630, 285, 660, 315]);

%% -------------------------------------------------------------
%% Add Blocks: AI Inference Stage
%% -------------------------------------------------------------
% AI Inference Capacity (images/day) = ModelRate * 1440 * Nodes
add_block('simulink/Sources/Constant', [modelName '/Inf_Capacity'], ...
    'Value', 'params.modelRate * 1440 * params.nodes', ...
    'Position', [340, 350, 460, 380]);

% Inference Utilisation = Usable Images Demand / Inf Capacity
add_block('simulink/Math Operations/Divide', [modelName '/Inf_Utilisation'], ...
    'Inputs', '*/', ...
    'Position', [510, 345, 540, 395]);

% Inference Shortfall
add_block('simulink/Math Operations/Sum', [modelName '/Inf_Shortfall_Diff'], ...
    'Inputs', '+-', ...
    'Position', [510, 410, 540, 440]);

add_block('simulink/Discontinuities/Saturation', [modelName '/Inf_Shortfall_Sat'], ...
    'LowerLimit', '0', ...
    'UpperLimit', 'inf', ...
    'Position', [565, 415, 595, 435]);

add_block('simulink/Continuous/Integrator', [modelName '/Inf_Backlog_Integrator'], ...
    'InitialCondition', '0', ...
    'LimitOutput', 'on', ...
    'LowerSaturationLimit', '0', ...
    'Position', [630, 410, 660, 440]);

%% -------------------------------------------------------------
%% Add Blocks: Referral Triage & Specialist Review Stage
%% -------------------------------------------------------------
% Referral Fraction (e.g. 0.18)
add_block('simulink/Sources/Constant', [modelName '/Referral_Fraction'], ...
    'Value', 'params.referralPct / 100', ...
    'Position', [30, 480, 110, 510]);

% Review Demand (patients/day flagged) = Daily Patients * Referral Fraction
add_block('simulink/Math Operations/Product', [modelName '/Review_Demand'], ...
    'Inputs', '2', ...
    'Position', [250, 475, 280, 525]);

% Specialist Review Capacity (patients/day) = Docs * PerDoc
add_block('simulink/Sources/Constant', [modelName '/Review_Capacity'], ...
    'Value', 'params.docs * params.perDoc', ...
    'Position', [340, 530, 460, 560]);

% Review Utilisation = Review Demand / Review Capacity
add_block('simulink/Math Operations/Divide', [modelName '/Review_Utilisation'], ...
    'Inputs', '*/', ...
    'Position', [510, 485, 540, 535]);

% Review Shortfall
add_block('simulink/Math Operations/Sum', [modelName '/Review_Shortfall_Diff'], ...
    'Inputs', '+-', ...
    'Position', [510, 560, 540, 590]);

add_block('simulink/Discontinuities/Saturation', [modelName '/Review_Shortfall_Sat'], ...
    'LowerLimit', '0', ...
    'UpperLimit', 'inf', ...
    'Position', [565, 565, 595, 585]);

add_block('simulink/Continuous/Integrator', [modelName '/Review_Backlog_Integrator'], ...
    'InitialCondition', '0', ...
    'LimitOutput', 'on', ...
    'LowerSaturationLimit', '0', ...
    'Position', [630, 560, 660, 590]);

%% -------------------------------------------------------------
%% Bottleneck Detector (Max Utilisation of the 4 Binding Stages)
%% -------------------------------------------------------------
add_block('simulink/Math Operations/MinMax', [modelName '/Max_Bottleneck_Util'], ...
    'Function', 'max', ...
    'Inputs', '4', ...
    'Position', [720, 270, 760, 360]);

%% -------------------------------------------------------------
%% Sinks: Displays, Scopes, To Workspace
%% -------------------------------------------------------------
% Scope for Stage Backlog Accumulation
add_block('simulink/Sinks/Scope', [modelName '/Backlog_Scope'], ...
    'NumInputPorts', '4', ...
    'Position', [730, 400, 770, 470]);

% Displays for Utilisation Ratios
add_block('simulink/Sinks/Display', [modelName '/Disp_Acq_Util'], ...
    'Position', [560, 95, 650, 125]);

add_block('simulink/Sinks/Display', [modelName '/Disp_Net_Util'], ...
    'Position', [560, 230, 650, 260]);

add_block('simulink/Sinks/Display', [modelName '/Disp_Inf_Util'], ...
    'Position', [560, 355, 650, 385]);

add_block('simulink/Sinks/Display', [modelName '/Disp_Review_Util'], ...
    'Position', [560, 495, 650, 525]);

add_block('simulink/Sinks/Display', [modelName '/Disp_Max_Bottleneck_Util'], ...
    'Position', [810, 300, 910, 330]);

% To Workspace blocks for MATLAB signal analysis
add_block('simulink/Sinks/To Workspace', [modelName '/Log_Acq_Backlog'], ...
    'VariableName', 'acq_backlog', 'SaveFormat', 'Array', ...
    'Position', [680, 160, 740, 190]);

add_block('simulink/Sinks/To Workspace', [modelName '/Log_Review_Backlog'], ...
    'VariableName', 'review_backlog', 'SaveFormat', 'Array', ...
    'Position', [680, 560, 740, 590]);

add_block('simulink/Sinks/To Workspace', [modelName '/Log_Max_Util'], ...
    'VariableName', 'bottleneck_util', 'SaveFormat', 'Array', ...
    'Position', [810, 250, 890, 280]);

%% -------------------------------------------------------------
%% Signal Connections (Wiring)
%% -------------------------------------------------------------
% Intake wiring
add_line(modelName, 'Target_Population/1', 'Annual_To_Daily_Rate/1');
add_line(modelName, 'Annual_To_Daily_Rate/1', 'Compute_Usable_Images/1');
add_line(modelName, 'Images_Per_Patient/1', 'Compute_Usable_Images/2');

% Reject math wiring
add_line(modelName, 'One_Const/1', 'Complement_Reject/1');
add_line(modelName, 'Reject_Fraction/1', 'Complement_Reject/2');
add_line(modelName, 'Complement_Reject/1', 'One_Minus_Reject/1');

% Acquisition wiring
add_line(modelName, 'Compute_Usable_Images/1', 'Capture_Attempts_Demand/1');
add_line(modelName, 'One_Minus_Reject/1', 'Capture_Attempts_Demand/2');
add_line(modelName, 'Capture_Attempts_Demand/1', 'Acq_Utilisation/1');
add_line(modelName, 'Acq_Capacity/1', 'Acq_Utilisation/2');
add_line(modelName, 'Acq_Utilisation/1', 'Disp_Acq_Util/1');

add_line(modelName, 'Capture_Attempts_Demand/1', 'Acq_Shortfall_Diff/1');
add_line(modelName, 'Acq_Capacity/1', 'Acq_Shortfall_Diff/2');
add_line(modelName, 'Acq_Shortfall_Diff/1', 'Acq_Shortfall_Sat/1');
add_line(modelName, 'Acq_Shortfall_Sat/1', 'Acq_Backlog_Integrator/1');
add_line(modelName, 'Acq_Backlog_Integrator/1', 'Log_Acq_Backlog/1');
add_line(modelName, 'Acq_Backlog_Integrator/1', 'Backlog_Scope/1');

% Network wiring
add_line(modelName, 'Compute_Usable_Images/1', 'Net_Utilisation/1');
add_line(modelName, 'Net_Capacity/1', 'Net_Utilisation/2');
add_line(modelName, 'Net_Utilisation/1', 'Disp_Net_Util/1');

add_line(modelName, 'Compute_Usable_Images/1', 'Net_Shortfall_Diff/1');
add_line(modelName, 'Net_Capacity/1', 'Net_Shortfall_Diff/2');
add_line(modelName, 'Net_Shortfall_Diff/1', 'Net_Shortfall_Sat/1');
add_line(modelName, 'Net_Shortfall_Sat/1', 'Net_Backlog_Integrator/1');
add_line(modelName, 'Net_Backlog_Integrator/1', 'Backlog_Scope/2');

% Inference wiring
add_line(modelName, 'Compute_Usable_Images/1', 'Inf_Utilisation/1');
add_line(modelName, 'Inf_Capacity/1', 'Inf_Utilisation/2');
add_line(modelName, 'Inf_Utilisation/1', 'Disp_Inf_Util/1');

add_line(modelName, 'Compute_Usable_Images/1', 'Inf_Shortfall_Diff/1');
add_line(modelName, 'Inf_Capacity/1', 'Inf_Shortfall_Diff/2');
add_line(modelName, 'Inf_Shortfall_Diff/1', 'Inf_Shortfall_Sat/1');
add_line(modelName, 'Inf_Shortfall_Sat/1', 'Inf_Backlog_Integrator/1');
add_line(modelName, 'Inf_Backlog_Integrator/1', 'Backlog_Scope/3');

% Specialist review wiring
add_line(modelName, 'Annual_To_Daily_Rate/1', 'Review_Demand/1');
add_line(modelName, 'Referral_Fraction/1', 'Review_Demand/2');
add_line(modelName, 'Review_Demand/1', 'Review_Utilisation/1');
add_line(modelName, 'Review_Capacity/1', 'Review_Utilisation/2');
add_line(modelName, 'Review_Utilisation/1', 'Disp_Review_Util/1');

add_line(modelName, 'Review_Demand/1', 'Review_Shortfall_Diff/1');
add_line(modelName, 'Review_Capacity/1', 'Review_Shortfall_Diff/2');
add_line(modelName, 'Review_Shortfall_Diff/1', 'Review_Shortfall_Sat/1');
add_line(modelName, 'Review_Shortfall_Sat/1', 'Review_Backlog_Integrator/1');
add_line(modelName, 'Review_Backlog_Integrator/1', 'Log_Review_Backlog/1');
add_line(modelName, 'Review_Backlog_Integrator/1', 'Backlog_Scope/4');

% Connect to Max Bottleneck Utilisation
add_line(modelName, 'Acq_Utilisation/1', 'Max_Bottleneck_Util/1');
add_line(modelName, 'Net_Utilisation/1', 'Max_Bottleneck_Util/2');
add_line(modelName, 'Inf_Utilisation/1', 'Max_Bottleneck_Util/3');
add_line(modelName, 'Review_Utilisation/1', 'Max_Bottleneck_Util/4');
add_line(modelName, 'Max_Bottleneck_Util/1', 'Disp_Max_Bottleneck_Util/1');
add_line(modelName, 'Max_Bottleneck_Util/1', 'Log_Max_Util/1');

%% -------------------------------------------------------------
%% Save Model
%% -------------------------------------------------------------
save_system(modelName, [modelName '.slx']);
fprintf('==> Successfully built and saved Simulink model: %s.slx\n', modelName);
fprintf('    To open and view in Simulink GUI, type: open_system(''%s'')\n', modelName);
fprintf('    To run dynamic simulation, type:        sim(''%s'')\n', modelName);
