function detectLesionsCli(imagePath, outputPath)
% DETECTLESIONSCLI Standalone CLI entrypoint for MATLAB Retinal Lesion Detection
% Usage:
%   matlab -batch "detectLesionsCli('input.jpg', 'output.json')"
%
% Runs the medical-grade lesion detection pipeline:
% 1. Reads and standardizes fundus image
% 2. Anatomical landmark estimation (Optic Disc, Macula/Fovea)
% 3. Directional morphological top-hats and scale saturation ladders
% 4. Lesion candidate typing (MA, HEM, HE, CWS) with vessel junction filtering
% 5. Outputs formatted JSON with candidates, counts, and quadrant metrics

    if nargin < 1
        error("Usage: detectLesionsCli(imagePath, [outputPath])");
    end
    if nargin < 2 || isempty(outputPath)
        outputPath = "lesion_results.json";
    end

    try
        [I, meta] = dr.readFundus(imagePath);
    catch err
        % Fallback standard image read if dr.readFundus encounters format quirk
        I = imread(imagePath);
        meta = struct("source", imagePath, "workingSize", [size(I,1) size(I,2)]);
    end

    % Estimate anatomy for disc/macula masking
    anatomy = [];
    try
        disc = dr.estimateOpticDisc(I);
        fm = dr.estimateFoveaMacula(I, disc);
        anatomy = struct("disc", disc, "fovea", fm.fovea, ...
                         "maculaRadius", fm.maculaRadius, ...
                         "nasalSide", fm.nasalSide);
    catch err
        warning("Anatomy landmark estimation warning: %s", err.message);
    end

    % Detect lesions using MATLAB mathematical morphology
    try
        lesions = dr.detectLesionCandidates(I, anatomy);
    catch err
        error("MATLAB Lesion Detection Failed: %s", err.message);
    end

    % Quadrant counts
    quadrants = [];
    if ~isempty(anatomy) && isfield(anatomy, "disc")
        try
            quadrants = dr.quadrantLesionCounts(lesions, anatomy.disc, size(I,2), size(I,1));
        catch
            quadrants = [];
        end
    end

    % Prepare serializable candidate array (strip heavy pixel index arrays for compact JSON)
    cands = lesions.candidates;
    cleanCands = cell(1, numel(cands));
    for k = 1:numel(cands)
        cleanCands{k} = struct(...
            "cx", round(cands(k).cx, 2), ...
            "cy", round(cands(k).cy, 2), ...
            "area", round(cands(k).area, 1), ...
            "type", string(cands(k).type), ...
            "onVessel", logical(cands(k).onVessel), ...
            "maxContrast", round(cands(k).maxContrast, 3), ...
            "meanGradient", round(cands(k).meanGradient, 3), ...
            "aspect", round(cands(k).aspect, 2), ...
            "fillRatio", round(cands(k).fillRatio, 3) ...
        );
    end

    result = struct(...
        "status", "success", ...
        "engine", "MATLAB Image Processing Toolbox", ...
        "version", version, ...
        "totalCandidates", numel(cleanCands), ...
        "counts", lesions.counts, ...
        "rejected", lesions.rejected, ...
        "retinaArea", lesions.retinaArea, ...
        "lesionPixels", lesions.lesionPixels, ...
        "onVesselCount", lesions.onVesselCount, ...
        "quadrants", quadrants, ...
        "candidates", {cleanCands} ...
    );

    jsonStr = jsonencode(result, "PrettyPrint", true);
    fid = fopen(outputPath, "w");
    if fid == -1
        error("Could not open output file for writing: %s", outputPath);
    end
    fprintf(fid, "%s", jsonStr);
    fclose(fid);
    fprintf("Lesion detection completed successfully. Output written to %s\n", outputPath);
end
