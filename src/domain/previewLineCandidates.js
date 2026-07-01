import { getLineIdFromStationId } from './previewVirtualStations.js';

const toText = (value) => String(value ?? '').trim();

export const getPreviewLineFeatureIdCandidates = (feature) => {
    const props = feature?.properties || {};
    return [
        props.lineId,
        props.r,
        props.geometry_line_id,
        props.line_offset_id,
        props.id,
        feature?.id
    ].map(toText).filter(Boolean);
};

export const selectPreviewLineFeatureCandidates = ({
    lineFeatures,
    source,
    lineId,
    realStationId
} = {}) => {
    const features = Array.isArray(lineFeatures) ? lineFeatures : [];
    const src = toText(source);
    const realLineId = getLineIdFromStationId(realStationId);
    const lid = toText(lineId) || realLineId;
    const sourceMatches = [];
    const lineMatches = [];

    for (const feature of features) {
        const props = feature?.properties || {};
        const featureSource = toText(props.line_offset_collision_source);
        const candidates = getPreviewLineFeatureIdCandidates(feature);
        if (src && featureSource === src) sourceMatches.push(feature);
        if ((lid && candidates.includes(lid)) || (realLineId && candidates.includes(realLineId))) {
            lineMatches.push(feature);
        }
    }

    return sourceMatches.length ? sourceMatches : lineMatches;
};
