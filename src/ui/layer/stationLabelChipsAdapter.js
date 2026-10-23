import { buildStationLabelPreviewIndex, selectStationLabelPreviewSegments } from '../../domain/stationLabelChipPreview.js';

const toText = (value) => String(value ?? '').trim();

const resolveBaseLabelText = (item) => {
    const cached = toText(item?._multiSelectBaseLabelText);
    if (cached) return cached;
    const fromProps = toText(item?.props?.name_zh || item?.props?.name || item?.stationId || '');
    const fromDom = toText(item?.el?.textContent || '');
    const text = fromProps || fromDom;
    item._multiSelectBaseLabelText = text;
    return text;
};

const restoreLabel = (item) => {
    const el = item?.el;
    if (!el) return;
    el.textContent = resolveBaseLabelText(item);
};

const buildServingLineIdsByStationId = (stationLabels = []) => {
    const servingLineIdsByStationId = new Map();
    for (const item of stationLabels) {
        const sid = toText(item?.stationId || item?.props?.id);
        if (!sid) continue;
        if (!servingLineIdsByStationId.has(sid)) servingLineIdsByStationId.set(sid, new Set());
        const targetSet = servingLineIdsByStationId.get(sid);
        const ids = Array.isArray(item?.servingLineIds) ? item.servingLineIds : [];
        for (const lineId of ids) {
            const id = toText(lineId);
            if (id) targetSet.add(id);
        }
    }
    return servingLineIdsByStationId;
};

export const createStationLabelChipsAdapter = ({
    createElement = (tag) => document.createElement(tag),
    getLineColor = () => '',
    getTransferStationIds = () => null,
    resolveRailColor = (color) => color,
    stationLabels = []
} = {}) => {
    const render = ({
        activeLineIds = [],
        showIcons = true,
        visibleTripSelections = []
    } = {}) => {
        if (!Array.isArray(stationLabels) || !stationLabels.length) return;

        const activeIds = activeLineIds.map(toText).filter(Boolean);
        const visibleTrips = Array.isArray(visibleTripSelections)
            ? visibleTripSelections.filter((entry) => entry?.hidden !== true)
            : [];

        if (!activeIds.length && !visibleTrips.length) {
            for (const item of stationLabels) restoreLabel(item);
            return;
        }

        const servingLineIdsByStationId = buildServingLineIdsByStationId(stationLabels);
        const previewIndex = buildStationLabelPreviewIndex({ visibleTripSelections: visibleTrips, getTransferStationIds });
        for (const item of stationLabels) {
            const el = item?.el;
            if (!el) continue;

            const sid = toText(item?.stationId || item?.props?.id);
            const transferGroup = sid ? getTransferStationIds(sid) : null;
            const groupedStationIds = (transferGroup && transferGroup.size)
                ? Array.from(transferGroup).map(toText).filter(Boolean)
                : (sid ? [sid] : []);

            const stationLineIdSet = new Set();
            for (const gid of groupedStationIds) {
                const lineSet = servingLineIdsByStationId.get(gid);
                if (!lineSet || !lineSet.size) continue;
                for (const lineId of lineSet) stationLineIdSet.add(toText(lineId));
            }

            if (!stationLineIdSet.size) {
                const fallbackIds = Array.isArray(item?.servingLineIds) ? item.servingLineIds : [];
                for (const lineId of fallbackIds) {
                    const id = toText(lineId);
                    if (id) stationLineIdSet.add(id);
                }
            }

            const renderByLineId = new Map();
            const renderOrder = [];
            const ensureRenderLine = (lineId) => {
                const id = toText(lineId);
                if (!id) return null;
                if (!renderByLineId.has(id)) {
                    renderByLineId.set(id, {
                        chipColor: resolveRailColor(getLineColor(id) || null) || '#999999',
                        lineId: id,
                        typeColors: []
                    });
                    renderOrder.push(id);
                }
                return renderByLineId.get(id);
            };

            for (const id of activeIds) {
                if (!stationLineIdSet.has(id)) continue;
                ensureRenderLine(id);
            }

            for (const segment of selectStationLabelPreviewSegments(previewIndex, groupedStationIds)) {
                const model = ensureRenderLine(segment.lineId);
                if (model && segment.typeColor) model.typeColors.push(segment.typeColor);
            }

            if (!renderOrder.length || !showIcons) {
                restoreLabel(item);
                continue;
            }

            const labelText = resolveBaseLabelText(item);

            let nameEl = el.querySelector('.station-label-name');
            if (!nameEl) {
                el.textContent = '';
                nameEl = createElement('div');
                nameEl.className = 'station-label-name';
                el.appendChild(nameEl);
            }
            nameEl.textContent = labelText;

            let chipsRowEl = el.querySelector('.station-label-multi-row');
            if (!chipsRowEl) {
                chipsRowEl = createElement('div');
                chipsRowEl.className = 'station-label-multi-row';
                el.appendChild(chipsRowEl);
            }
            chipsRowEl.innerHTML = '';

            for (const lineId of renderOrder) {
                const lineModel = renderByLineId.get(lineId);
                if (!lineModel) continue;

                const cluster = createElement('span');
                cluster.className = 'station-label-multi-cluster';

                const chip = createElement('span');
                chip.className = 'station-label-multi-chip';
                chip.style.backgroundColor = toText(lineModel.chipColor || '#999999');
                cluster.appendChild(chip);

                for (const typeColor of lineModel.typeColors) {
                    const typeDot = createElement('span');
                    typeDot.className = 'station-label-multi-type-dot';
                    const resolvedTypeColor = resolveRailColor(typeColor) || toText(typeColor);
                    typeDot.style.backgroundColor = toText(resolvedTypeColor);
                    cluster.appendChild(typeDot);
                }

                chipsRowEl.appendChild(cluster);
            }
        }
    };

    return { render };
};
