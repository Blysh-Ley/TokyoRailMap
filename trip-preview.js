const toText = (value) => String(value ?? '').trim();

const isFiniteCoord = (pt) => {
    if (!Array.isArray(pt) || pt.length < 2) return false;
    const lng = Number(pt[0]);
    const lat = Number(pt[1]);
    return Number.isFinite(lng) && Number.isFinite(lat);
};

const distMeters = (a, b) => {
    if (!isFiniteCoord(a) || !isFiniteCoord(b)) return Number.POSITIVE_INFINITY;
    const lng1 = Number(a[0]);
    const lat1 = Number(a[1]);
    const lng2 = Number(b[0]);
    const lat2 = Number(b[1]);
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const mLat = ((lat1 + lat2) / 2) * (Math.PI / 180);
    const x = dLng * Math.cos(mLat);
    const y = dLat;
    return Math.sqrt(x * x + y * y) * 6371000;
};

const findNearestIndex = (chain, coord) => {
    if (!Array.isArray(chain) || !isFiniteCoord(coord)) return { index: -1, dist: Number.POSITIVE_INFINITY };
    let bestIdx = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < chain.length; i += 1) {
        const pt = chain[i];
        if (!isFiniteCoord(pt)) continue;
        const d = distMeters(pt, coord);
        if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
        }
    }
    return { index: bestIdx, dist: bestDist };
};

const collectCandidateIndices = (chain, coord, maxSnapMeters) => {
    const out = [];
    if (!Array.isArray(chain) || !isFiniteCoord(coord)) return out;

    const nearest = findNearestIndex(chain, coord);
    for (let i = 0; i < chain.length; i += 1) {
        const pt = chain[i];
        if (!isFiniteCoord(pt)) continue;
        const d = distMeters(pt, coord);
        if (Number.isFinite(d) && d <= maxSnapMeters) {
            out.push({ index: i, dist: d });
        }
    }

    if (!out.length && nearest.index >= 0 && Number.isFinite(nearest.dist) && nearest.dist <= maxSnapMeters) {
        out.push(nearest);
    }

    out.sort((a, b) => {
        const dd = Number(a.dist) - Number(b.dist);
        if (dd) return dd;
        return Number(a.index) - Number(b.index);
    });
    return out;
};

const dedupeAdjacentCoords = (coords) => {
    const list = Array.isArray(coords) ? coords : [];
    const out = [];
    for (const pt of list) {
        if (!isFiniteCoord(pt)) continue;
        const prev = out.length ? out[out.length - 1] : null;
        if (prev && distMeters(prev, pt) <= 0.5) continue;
        out.push(pt);
    }
    return out;
};

const computePathLength = (coords) => {
    const list = Array.isArray(coords) ? coords : [];
    let sum = 0;
    for (let i = 0; i < list.length - 1; i += 1) {
        const d = distMeters(list[i], list[i + 1]);
        if (!Number.isFinite(d)) return Number.POSITIVE_INFINITY;
        sum += d;
    }
    return sum;
};

const buildForwardPathByIndices = (ring, fromIdx, toIdx) => {
    const n = Array.isArray(ring) ? ring.length : 0;
    if (n < 2) return null;
    if (!Number.isFinite(fromIdx) || !Number.isFinite(toIdx)) return null;
    const i = Math.trunc(fromIdx);
    const j = Math.trunc(toIdx);
    if (i < 0 || j < 0 || i >= n || j >= n) return null;
    if (j < i) return null;
    const out = ring.slice(i, j + 1);
    return dedupeAdjacentCoords(out);
};

export const isLoopDirection = (value) => {
    const text = toText(value).toLowerCase();
    return text.includes('loop');
};

const getLoopSense = (value) => {
    const text = toText(value).toLowerCase();
    if (!text) return null;
    if (text.includes('inner')) return 'inner';
    if (text.includes('outer')) return 'outer';
    return null;
};

export const extractShortestLoopSegmentByIndex = (chain, fromCoord, toCoord, options = {}) => {
    if (!Array.isArray(chain) || chain.length < 4) return null;
    if (!isFiniteCoord(fromCoord) || !isFiniteCoord(toCoord)) return null;

    const maxSnapMeters = Number.isFinite(options.maxSnapMeters) ? Number(options.maxSnapMeters) : 250;

    const loopSense = getLoopSense(options?.direction || options?.d);

    const runOnRing = (ring, orientation) => {
        const base = Array.isArray(ring) ? ring.filter((pt) => isFiniteCoord(pt)) : [];
        if (base.length < 3) return null;
        const useRing = orientation === 'reversed' ? base.slice().reverse() : base;

        const fromCandidates = collectCandidateIndices(useRing, fromCoord, maxSnapMeters);
        const toCandidates = collectCandidateIndices(useRing, toCoord, maxSnapMeters);
        if (!fromCandidates.length || !toCandidates.length) return null;

        const scoreOf = (path, fromSnapDist, toSnapDist) => {
            if (!Array.isArray(path) || path.length < 2) return Number.POSITIVE_INFINITY;
            return computePathLength(path) + Number(fromSnapDist || 0) + Number(toSnapDist || 0);
        };

        const virtualTrips = [];

        for (const fromCandidate of fromCandidates) {
            for (const toCandidate of toCandidates) {
                const path = buildForwardPathByIndices(useRing, fromCandidate.index, toCandidate.index);
                const score = scoreOf(path, fromCandidate.dist, toCandidate.dist);
                if (!Array.isArray(path) || path.length < 2 || !Number.isFinite(score)) continue;
                virtualTrips.push({
                    fromIndex: fromCandidate.index,
                    toIndex: toCandidate.index,
                    fromSnapDist: fromCandidate.dist,
                    toSnapDist: toCandidate.dist,
                    score,
                    path
                });
            }
        }

        if (!virtualTrips.length) return null;

        virtualTrips.sort((a, b) => {
            const ds = Number(a.score) - Number(b.score);
            if (ds) return ds;
            const dl = Number(a.toIndex - a.fromIndex) - Number(b.toIndex - b.fromIndex);
            if (dl) return dl;
            return Number(a.fromIndex) - Number(b.fromIndex);
        });

        const bestTrip = virtualTrips[0] || null;
        const best = bestTrip?.path || null;
        if (!Array.isArray(best) || best.length < 2) return null;

        const withEndpoints = dedupeAdjacentCoords([fromCoord, ...best, toCoord]);
        if (withEndpoints.length < 2) return null;

        return {
            orientation,
            ringLen: useRing.length,
            fromCandidates: fromCandidates.length,
            toCandidates: toCandidates.length,
            bestTrip,
            coords: withEndpoints
        };
    };

    const ring = chain;
    const preferredOrientation = loopSense === 'outer' ? 'reversed' : 'normal';
    const primary = runOnRing(ring, preferredOrientation);
    const secondary = runOnRing(ring, preferredOrientation === 'reversed' ? 'normal' : 'reversed');

    const pick = (() => {
        if (primary && secondary) {
            const a = Number(primary?.bestTrip?.score);
            const b = Number(secondary?.bestTrip?.score);
            if (Number.isFinite(a) && Number.isFinite(b)) return a <= b ? primary : secondary;
            return primary || secondary;
        }
        return primary || secondary;
    })();

    const bestTrip = pick?.bestTrip || null;
    const best = pick?.coords || null;

    const debugEnabled = (() => {
        try {
            return globalThis?.__TokyoRailDebugLoopSlice === true;
        } catch {
            return false;
        }
    })();
    if (debugEnabled && bestTrip) {
        try {
            // eslint-disable-next-line no-console
            console.debug('[loop-slice]', {
                sense: loopSense,
                orientation: pick?.orientation || null,
                fromIndex: bestTrip.fromIndex,
                toIndex: bestTrip.toIndex,
                score: Math.round(Number(bestTrip.score) || 0),
                fromSnap: Math.round(Number(bestTrip.fromSnapDist) || 0),
                toSnap: Math.round(Number(bestTrip.toSnapDist) || 0),
                fromCandidates: pick?.fromCandidates || 0,
                toCandidates: pick?.toCandidates || 0,
                ringLen: pick?.ringLen || 0
            });
        } catch {
            // ignore
        }
    }

    if (!Array.isArray(best) || best.length < 2) return null;
    return best;
};

export const buildTripPreviewKey = (lineId, tripKey) => `${toText(lineId)}||${toText(tripKey)}`;

export function createTripPreviewScheduler(options = {}) {
    const onPreview = typeof options.onPreview === 'function' ? options.onPreview : null;
    const getHoverPreviewEnabled = typeof options.getHoverPreviewEnabled === 'function'
        ? options.getHoverPreviewEnabled
        : (() => true);
    const delayMs = Number.isFinite(options.delayMs) ? Math.max(0, Number(options.delayMs)) : 500;

    let timerId = null;
    let candidateKey = null;
    let appliedKey = null;

    const clearPending = () => {
        if (timerId != null) {
            clearTimeout(timerId);
            timerId = null;
        }
        candidateKey = null;
    };

    const dispatchPreview = (previewKey, payload) => {
        if (!onPreview) return;
        try {
            appliedKey = toText(previewKey) || null;
            onPreview(payload);
        } catch {
            // ignore
        }
    };

    const schedule = ({ previewKey, payload, immediate } = {}) => {
        if (!onPreview) return;
        if (!immediate && getHoverPreviewEnabled() === false) return;

        if (immediate) {
            clearPending();
            dispatchPreview(previewKey, payload);
            return;
        }

        clearPending();
        candidateKey = toText(previewKey);
        const key = candidateKey;
        timerId = setTimeout(() => {
            timerId = null;
            if (candidateKey !== key) return;
            candidateKey = null;
            dispatchPreview(previewKey, payload);
        }, delayMs);
    };

    const clearApplied = () => {
        appliedKey = null;
    };

    const reset = () => {
        clearPending();
        clearApplied();
    };

    const isPendingKey = (previewKey) => candidateKey === toText(previewKey);
    const isAppliedKey = (previewKey) => appliedKey === toText(previewKey);

    return {
        schedule,
        clearPending,
        clearApplied,
        reset,
        isPendingKey,
        isAppliedKey,
        getPendingKey: () => candidateKey,
        getAppliedKey: () => appliedKey
    };
}
