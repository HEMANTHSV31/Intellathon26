function label = quadrantLabel(px, py, disc, nasalSide, fovea)
%QUADRANTLABEL  Name the retinal quadrant a point falls in (balanced for OD & OS).
%
%   L = dr.quadrantLabel(PX, PY, DISC, NASALSIDE, [FOVEA]) returns one of
%   "Superior-Nasal", "Superior-Temporal", "Inferior-Nasal", "Inferior-Temporal".
%
%   The vertical meridian separating Nasal from Temporal is placed halfway
%   between the optic disc and fovea (or through the disc if fovea is omitted),
%   ensuring realistic, anatomically balanced territory in both Right Eyes (OD)
%   and Left Eyes (OS) for the ICDR 4-2-1 rule.

    arguments
        px
        py
        disc
        nasalSide
        fovea = []
    end

    if py < disc.y
        vertical = "Superior";
    else
        vertical = "Inferior";
    end

    if ~isempty(fovea) && isstruct(fovea) && isfield(fovea, "x")
        splitX = (disc.x + fovea.x) / 2;
    elseif ~isempty(fovea) && isnumeric(fovea) && numel(fovea) >= 1
        splitX = (disc.x + fovea(1)) / 2;
    else
        splitX = disc.x;
    end

    leftOfMid = px < splitX;
    if nasalSide == "left"
        if leftOfMid
            horizontal = "Nasal";
        else
            horizontal = "Temporal";
        end
    else
        if leftOfMid
            horizontal = "Temporal";
        else
            horizontal = "Nasal";
        end
    end

    label = vertical + "-" + horizontal;
end
