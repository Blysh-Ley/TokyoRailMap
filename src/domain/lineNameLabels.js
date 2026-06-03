const toText = (value) => String(value ?? '').trim();
const LINE_NAME_LABEL_BLOCKED_TOKENS = Object.freeze(['货物', '貨物', '支线', '支線']);
const LINE_NAME_LABEL_NORMAL_OFFSET_EM = 0.9;
const LINE_NAME_LABEL_LINE_OFFSET_EM_PER_UNIT = 1 / 3;

const isLineGeometry = (geometry) => (
    (geometry?.type === 'LineString' && Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 2)
    || (geometry?.type === 'MultiLineString' && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0)
);

const isVisibleLineFeature = (feature) => {
    const props = feature?.properties || {};
    const lineId = toText(props.id || feature?.id);
    return Boolean(
        lineId
        && !lineId.startsWith('Base.')
        && Number(props.hidden_by_opacity_zero) !== 1
        && isLineGeometry(feature?.geometry)
    );
};

const shouldShowLineNameLabel = (name) => {
    const text = toText(name);
    if (!text) return false;
    return !LINE_NAME_LABEL_BLOCKED_TOKENS.some((token) => text.includes(token));
};

const roundOffset = (value) => Math.round(value * 10000) / 10000;

const buildLineNameTextOffset = (lineOffsetUnits) => {
    const units = Number(lineOffsetUnits);

    if (!Number.isFinite(units)) {
        return [0, LINE_NAME_LABEL_NORMAL_OFFSET_EM];
    }

    if (units === 0) {
        return [0, LINE_NAME_LABEL_NORMAL_OFFSET_EM];
    }

    const direction = Math.sign(units);
    const distance =
        Math.abs(units) * LINE_NAME_LABEL_LINE_OFFSET_EM_PER_UNIT
        + LINE_NAME_LABEL_NORMAL_OFFSET_EM;

    return [0, roundOffset(direction * distance)];
};

export const buildLineNameLabelGeoJSON = (lineFeatures = []) => {
    const features = [];
    const seen = new Set();

    for (const feature of Array.isArray(lineFeatures) ? lineFeatures : []) {
        if (!isVisibleLineFeature(feature)) continue;

        const props = feature.properties || {};
        const lineId = toText(props.id || feature.id);
        if (!lineId || seen.has(lineId)) continue;

        const name = toText(props.name) || lineId;
        if (!shouldShowLineNameLabel(name)) continue;
        const lineOffsetUnits = Number(props.line_offset_units) || 0;

        seen.add(lineId);
        features.push({
            type: 'Feature',
            id: `${lineId}.name-label`,
            properties: {
                id: lineId,
                name,
                color: toText(props.color),
                line_offset_units: lineOffsetUnits,
                text_offset: buildLineNameTextOffset(lineOffsetUnits),
                type: 'line-name-label'
            },
            geometry: feature.geometry
        });
    }

    return { type: 'FeatureCollection', features };
};
