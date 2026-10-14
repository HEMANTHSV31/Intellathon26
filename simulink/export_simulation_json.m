%% EXPORT_SIMULATION_JSON.M
% Runs the capacity model in MATLAB and exports the verified simulation
% metrics and dynamic time series to JSON for full-stack integration.

clear; clc;
res = simulate_steady_and_dynamic();

jsonString = jsonencode(res, 'PrettyPrint', true);
outputFile = 'screening_simulation_results.json';

fid = fopen(outputFile, 'w');
if fid == -1
    error('Could not create output JSON file.');
end
fwrite(fid, jsonString, 'char');
fclose(fid);

fprintf('==> Exported MATLAB / Simulink simulation results to: %s\n', outputFile);
