const isFiniteNumber = (value) => Number.isFinite(value);

const extendBBox = (bbox, lng, lat) => {
    if (!isFiniteNumber(lng) || !isFiniteNumber(lat)) return bbox;
    if (!bbox) return { minLng: lng, minLat: lat, maxLng: lng, maxLat: lat };
    return {
        minLng: Math.min(bbox.minLng, lng),
        minLat: Math.min(bbox.minLat, lat),
        maxLng: Math.max(bbox.maxLng, lng),
        maxLat: Math.max(bbox.maxLat, lat)
    };
};

const unionBBox = (a, b) => {
    if (!a) return b;
    if (!b) return a;
    if (![a.minLng, a.minLat, a.maxLng, a.maxLat].every(isFiniteNumber)) return b;
    if (![b.minLng, b.minLat, b.maxLng, b.maxLat].every(isFiniteNumber)) return a;
    return {
        minLng: Math.min(a.minLng, b.minLng),
        minLat: Math.min(a.minLat, b.minLat),
        maxLng: Math.max(a.maxLng, b.maxLng),
        maxLat: Math.max(a.maxLat, b.maxLat)
    };
};

const bboxToFitBounds = (bbox) => {
    if (!bbox) return null;
    if (![bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat].every(isFiniteNumber)) return null;
    return [
        [bbox.minLng, bbox.minLat],
        [bbox.maxLng, bbox.maxLat]
    ];
};

const bboxFromGeometry = (geom) => {
    if (!geom) return null;
    const { type, coordinates } = geom;
    let bbox = null;

    if (type === 'LineString' && Array.isArray(coordinates)) {
        for (const point of coordinates) {
            if (!Array.isArray(point) || point.length < 2) continue;
            bbox = extendBBox(bbox, Number(point[0]), Number(point[1]));
        }
        return bbox;
    }

    if (type === 'MultiLineString' && Array.isArray(coordinates)) {
        for (const line of coordinates) {
            if (!Array.isArray(line)) continue;
            for (const point of line) {
                if (!Array.isArray(point) || point.length < 2) continue;
                bbox = extendBBox(bbox, Number(point[0]), Number(point[1]));
            }
        }
    }

    return bbox;
};

export const createRoutePreviewViewportController = ({
    mapEngine,
    isAdaptiveViewportEnabled = () => true,
    getMenuElement = () => null,
    getPanelElement = () => null,
    getTripDetailElement = () => null,
    getSelectedLineId = () => '',
    getSelectedStationLineIds = () => null,
    getSelectedCompany = () => '',
    getEnabledLineIdsByCompany = () => new Map(),
    getStationCoord = () => null,
    requestFrame = (callback) => requestAnimationFrame(callback)
} = {}) => {
    if (!mapEngine) {
        throw new Error('routePreviewViewportController requires mapEngine');
    }

    const lineBoundsById = new Map();
    let lastFitKey = null;
    let fitRafId = null;
    let pendingFit = null;
    let lastFitPaddingSig = null;

    const isRectOnScreen = (rect) => {
        if (!rect) return false;
        if (!isFiniteNumber(rect.width) || !isFiniteNumber(rect.height)) return false;
        if (rect.width <= 0 || rect.height <= 0) return false;
        const win = globalThis.window || {};
        const docEl = globalThis.document?.documentElement || {};
        const viewportWidth = Number(win.innerWidth || docEl.clientWidth || 0);
        const viewportHeight = Number(win.innerHeight || docEl.clientHeight || 0);
        if (!isFiniteNumber(viewportWidth) || !isFiniteNumber(viewportHeight) || viewportWidth <= 0 || viewportHeight <= 0) return true;
        return rect.right > 0 && rect.left < viewportWidth && rect.bottom > 0 && rect.top < viewportHeight;
    };

    const readPanelLayout = () => {
        try {
            const el = getPanelElement?.();
            const rect = el?.getBoundingClientRect?.();
            return {
                rect,
                visible: isRectOnScreen(rect)
            };
        } catch {
            return { rect: null, visible: false };
        }
    };

    const getFitPadding = (paddingMode = 'auto', fitPaddingOptions = {}) => {
        const base = 60;
        const fallback = { top: base, right: base, bottom: base, left: base };
        if (paddingMode === 'full') return fallback;
        const ignoreTripDetail = fitPaddingOptions?.ignoreTripDetailInset === true;
        const panelLayout = readPanelLayout();

        let left = base;
        const menuEl = panelLayout.visible ? null : getMenuElement?.();
        if (menuEl) {
            const rect = menuEl.getBoundingClientRect?.();
            if (rect && Number.isFinite(rect.width)) {
                const reserve = Math.max(0, Number.isFinite(rect.right) ? rect.right : 0, rect.width);
                left = Math.max(base, Math.ceil(reserve + base + 200));
            }
        }

        let right = base;
        try {
            const panelRect = panelLayout.rect;
            if (panelRect && Number.isFinite(panelRect.width) && panelRect.width > 0) {
                right = Math.max(right, Math.ceil(panelRect.width + base));
            }
        } catch {
            // ignore layout reads that fail during startup
        }

        try {
            const tripEl = getTripDetailElement?.();
            const hidden = tripEl?.classList?.contains('is-hidden');
            const rect = tripEl?.getBoundingClientRect?.();
            if (!ignoreTripDetail && !hidden && rect && Number.isFinite(rect.width) && rect.width > 0) {
                right = Math.max(right, Math.ceil(right + rect.width));
            }
        } catch {
            // ignore layout reads that fail during startup
        }

        return { top: base, right, bottom: base, left };
    };

    const previewFitWithSidePanels = (bbox, options = {}) => {
        if (!isAdaptiveViewportEnabled?.()) return;
        const bounds = bboxToFitBounds(bbox);
        if (!bounds) return;
        const ignoreTripDetail = options?.ignoreTripDetailInset === true;

        const base = 50;
        let right = base;
        let left = base;
        const panelLayout = readPanelLayout();

        try {
            const menuRect = panelLayout.visible ? null : getMenuElement?.()?.getBoundingClientRect?.();
            if (menuRect && Number.isFinite(menuRect.width)) {
                left = Math.max(left, Math.ceil(Math.max(menuRect.right || 0, menuRect.width) + base));
            }
        } catch {
            // ignore
        }

        try {
            const panelRect = panelLayout.rect;
            if (panelRect && Number.isFinite(panelRect.width)) {
                right = Math.max(right, Math.ceil(panelRect.width + base));
            }
        } catch {
            // ignore
        }

        try {
            const tripEl = getTripDetailElement?.();
            const hidden = tripEl?.classList?.contains('is-hidden');
            const rect = tripEl?.getBoundingClientRect?.();
            if (!ignoreTripDetail && !hidden && rect && Number.isFinite(rect.width) && rect.width > 0) {
                right = Math.max(right, Math.ceil(right + rect.width));
            }
        } catch {
            // ignore
        }

        try {
            mapEngine.fitBounds(bounds, {
                padding: { top: base, bottom: base, left, right },
                duration: 280,
                easing: (t) => t,
                essential: true
            });
        } catch {
            // keep preview viewport fitting non-fatal
        }
    };

    const bboxFromStationIds = (stationIds) => {
        const list = Array.isArray(stationIds) ? stationIds : [];
        let bbox = null;
        for (const stationId of list) {
            const sid = String(stationId || '').trim();
            if (!sid) continue;
            const coord = getStationCoord?.(sid);
            if (!Array.isArray(coord) || coord.length < 2) continue;
            bbox = extendBBox(bbox, Number(coord[0]), Number(coord[1]));
        }
        return bbox;
    };

    const addLineBounds = (lineId, geom) => {
        const key = String(lineId || '').trim();
        if (!key) return false;
        const bbox = bboxFromGeometry(geom);
        if (!bbox) return false;
        lineBoundsById.set(key, unionBBox(lineBoundsById.get(key) ?? null, bbox));
        return true;
    };

    const getBBoxForSelected = () => {
        const selectedLineId = String(getSelectedLineId?.() || '').trim();
        if (selectedLineId) {
            const selectedStationLineIds = getSelectedStationLineIds?.();
            if (selectedStationLineIds && selectedStationLineIds.size > 1) {
                let bbox = null;
                for (const id of selectedStationLineIds) {
                    bbox = unionBBox(bbox, lineBoundsById.get(String(id)) ?? null);
                }
                return bbox;
            }
            return lineBoundsById.get(selectedLineId) ?? null;
        }

        const selectedCompany = String(getSelectedCompany?.() || '').trim();
        if (!selectedCompany) return null;
        const ids = getEnabledLineIdsByCompany?.()?.get(selectedCompany);
        if (!ids || ids.size === 0) return null;

        let bbox = null;
        for (const id of ids) {
            bbox = unionBBox(bbox, lineBoundsById.get(String(id)) ?? null);
        }
        return bbox;
    };

    const scheduleFit = (key, bbox, options = {}) => {
        if (!isAdaptiveViewportEnabled?.()) return;
        if (!bbox) return;
        const padding = getFitPadding(options?.paddingMode, options);
        const ignoreTripDetailSig = options?.ignoreTripDetailInset === true ? '1' : '0';
        const paddingSig = `${ignoreTripDetailSig}|l${padding.left}|r${padding.right}|t${padding.top}|b${padding.bottom}`;
        if (key && key === lastFitKey && paddingSig === lastFitPaddingSig) return;

        pendingFit = { key, bbox, options, padding, paddingSig };
        if (fitRafId != null) return;

        fitRafId = requestFrame(() => {
            fitRafId = null;
            const next = pendingFit;
            pendingFit = null;
            if (!next) return;

            const bounds = bboxToFitBounds(next.bbox);
            if (!bounds) return;
            const flat = [bounds[0]?.[0], bounds[0]?.[1], bounds[1]?.[0], bounds[1]?.[1]];
            if (!flat.every(isFiniteNumber)) return;

            lastFitKey = next.key ?? null;
            lastFitPaddingSig = next.paddingSig ?? null;
            const fitOptions = {
                padding: next.padding || 60,
                duration: 300,
                easing: (t) => t,
                essential: true
            };
            if (Number.isFinite(next.options?.maxZoom)) fitOptions.maxZoom = next.options.maxZoom;
            mapEngine.fitBounds(bounds, fitOptions);
        });
    };

    const fitToCurrentSelectionPreview = (triggerKey, options = {}) => {
        const bbox = getBBoxForSelected();
        if (!bbox) return;
        scheduleFit(`preview:${triggerKey}`, bbox, {
            maxZoom: 11,
            ...options
        });
    };

    const fitToCurrentSelectionCommit = (triggerKey, options = {}) => {
        const bbox = getBBoxForSelected();
        if (!bbox) return;
        scheduleFit(`commit:${triggerKey}`, bbox, {
            maxZoom: undefined,
            paddingMode: 'full',
            ...options
        });
    };

    const fitToCurrentSelection = (triggerKey, mode = 'preview', options = {}) => {
        const key = String(triggerKey ?? '');
        const explicitCommit = key.startsWith('commit:');
        const explicitPreview = key.startsWith('preview:');
        const cleanKey = key.replace(/^(commit:|preview:)/, '');
        const useCommit = explicitCommit || (!explicitPreview && mode === 'commit');
        if (useCommit) fitToCurrentSelectionCommit(cleanKey, options);
        else fitToCurrentSelectionPreview(cleanKey, options);
    };

    return {
        addLineBounds,
        bboxFromStationIds,
        fitToCurrentSelection,
        fitToCurrentSelectionPreview,
        fitToCurrentSelectionCommit,
        previewFitWithSidePanels
    };
};
