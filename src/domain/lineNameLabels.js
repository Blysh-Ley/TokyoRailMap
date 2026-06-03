import { pickLineHighlightLabelCoordinate } from './lineHighlightLabels.js';

const toText = (value) => String(value ?? '').trim();

const isVisibleLineFeature = (feature) => {
    const props = feature?.properties || {};
    const lineId = toText(props.id || feature?.id);
    return Boolean(
        lineId
        && !lineId.startsWith('Base.')
        && Number(props.hidden_by_opacity_zero) !== 1
        && feature?.geometry?.type
    );
};

export const buildLineNameLabelGeoJSON = (lineFeatures = []) => {
    const features = [];
    const seen = new Set();

    for (const feature of Array.isArray(lineFeatures) ? lineFeatures : []) {
        if (!isVisibleLineFeature(feature)) continue;

        const props = feature.properties || {};
        const lineId = toText(props.id || feature.id);
        if (!lineId || seen.has(lineId)) continue;

        const coordinate = pickLineHighlightLabelCoordinate(feature.geometry);
        const name = toText(props.name) || lineId;
        if (!coordinate || !name) continue;

        seen.add(lineId);
        features.push({
            type: 'Feature',
            id: `${lineId}.name-label`,
            properties: {
                id: lineId,
                name,
                color: toText(props.color),
                type: 'line-name-label'
            },
            geometry: {
                type: 'Point',
                coordinates: coordinate
            }
        });
    }

    return { type: 'FeatureCollection', features };
};
