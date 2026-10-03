import { createTransferCapsuleFrameRenderer } from './transferCapsuleFrameRenderer.js';
import { createStationCircleFrameRenderer } from './stationCircleFrameRenderer.js';
import { createStationLabelAnchorBuffers } from './stationLabelAnchorBuffers.js';
import { createStationFrameProjection, stationFramePointToLngLat } from '../domain/stationFrameGeometry.js';
import { DEFAULT_BASEMAP_MODE, normalizeBasemapMode } from '../domain/basemapMode.js';
import {
    OSM_BASEMAP_ATTRIBUTION_ITEMS,
    DEFAULT_OSM_BASEMAP_PMTILES_URL,
    OSM_BASEMAP_ATTRIBUTION_HTML,
    toPmtilesTileTemplate
} from '../domain/osmBasemapPackage.js';
import {
    OPENFREEMAP_ATTRIBUTION_ITEMS
} from '../domain/openFreeMapBasemap.js';
import {
    BASEMAP_SOURCE_OPENFREEMAP,
    BASEMAP_SOURCE_PMTILES
} from '../domain/basemapSource.js';
import {
    readAndroidPmtilesRange,
    shouldUseAndroidNativePmtiles
} from './androidPmtilesArchiveSource.js';

const pmtilesProtocolTargets = new WeakSet();
let pmtilesRangeRequestCounter = 0;

const toGeoJsonFeatureId = (feature, promoteId = '') => {
    if (promoteId) return feature?.properties?.[promoteId];
    return feature?.id;
};

export const buildGeoJsonUpdateDiff = (data, { featureIds, promoteId = '' } = {}) => {
    const features = Array.isArray(data?.features) ? data.features : null;
    if (!features) return null;

    const allowedIds = featureIds instanceof Set
        ? featureIds
        : (Array.isArray(featureIds) ? new Set(featureIds) : null);
    const update = [];

    for (const feature of features) {
        const id = toGeoJsonFeatureId(feature, promoteId);
        if (id == null) return null;
        if (allowedIds && !allowedIds.has(id) && !allowedIds.has(String(id))) continue;
        if (!feature?.geometry || typeof feature.geometry !== 'object') return null;
        update.push({ id, newGeometry: feature.geometry });
    }

    return { update };
};

const appendPmtilesRangeCacheKey = (url, offset, length) => {
    const value = String(url || '').trim();
    if (!value) return value;
    const hashIndex = value.indexOf('#');
    const base = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
    const hash = hashIndex >= 0 ? value.slice(hashIndex) : '';
    const separator = base.includes('?') ? '&' : '?';
    pmtilesRangeRequestCounter = (pmtilesRangeRequestCounter + 1) % Number.MAX_SAFE_INTEGER;
    return `${base}${separator}pmtiles-range=${offset}-${length}-${pmtilesRangeRequestCounter}${hash}`;
};

const createRangeSafePmtilesSource = (url) => ({
    getKey: () => url,
    getBytes: async (offset, length, signal, etag) => {
        if (shouldUseAndroidNativePmtiles({ url })) {
            const range = await readAndroidPmtilesRange({ offset, length });
            if (!range?.data) throw new Error('Android PMTiles range reader returned no data');
            return {
                data: range.data,
                etag: undefined,
                cacheControl: undefined,
                expires: undefined
            };
        }

        const headers = new Headers();
        headers.set('Range', `bytes=${offset}-${offset + length - 1}`);
        const response = await fetch(appendPmtilesRangeCacheKey(url, offset, length), {
            cache: 'no-store',
            headers,
            signal
        });
        const responseEtag = response.headers?.get?.('Etag');
        const nextEtag = responseEtag && !responseEtag.startsWith('W/') ? responseEtag : undefined;
        if (response.status === 416 || (etag && nextEtag && nextEtag !== etag)) {
            throw new Error('PMTiles archive changed while reading ranges');
        }
        if (response.status >= 300) {
            throw new Error(`Bad response code: ${response.status}`);
        }
        const contentLength = Number(response.headers?.get?.('Content-Length') || 0);
        if (response.status === 200 && (!contentLength || contentLength > length)) {
            throw new Error('PMTiles server does not support byte range requests');
        }
        return {
            data: await response.arrayBuffer(),
            etag: nextEtag,
            cacheControl: response.headers?.get?.('Cache-Control') || undefined,
            expires: response.headers?.get?.('Expires') || undefined
        };
    }
});

const createRangeSafePmtilesProtocol = (pmtilesGlobal) => {
    const PMTilesCtor = pmtilesGlobal?.PMTiles;
    if (typeof PMTilesCtor !== 'function') return null;

    const archives = new Map();
    const getArchive = (url) => {
        if (!archives.has(url)) {
            archives.set(url, new PMTilesCtor(createRangeSafePmtilesSource(url)));
        }
        return archives.get(url);
    };

    const tile = (params, callback) => {
        const abortController = new AbortController();
        Promise.resolve().then(async () => {
            const match = String(params?.url || '').match(/^pmtiles:\/\/(.+)\/(\d+)\/(\d+)\/(\d+)(?:\.\w+)?$/);
            if (!match) throw new Error('Invalid PMTiles protocol URL');
            const [, archiveUrl, z, x, y] = match;
            const tileResult = await getArchive(archiveUrl).getZxy(+z, +x, +y, abortController.signal);
            if (!tileResult) {
                callback(null, new ArrayBuffer(0));
                return;
            }
            const data = tileResult.data instanceof ArrayBuffer
                ? tileResult.data
                : tileResult.data.buffer.slice(
                    tileResult.data.byteOffset,
                    tileResult.data.byteOffset + tileResult.data.byteLength
                );
            callback(
                null,
                data,
                tileResult.cacheControl || '',
                tileResult.expires || ''
            );
        }).catch((error) => callback(error));

        return {
            cancel: () => abortController.abort()
        };
    };

    return { tile };
};

// Keep the replacement circles at the retained station layer's visual position.
// Highlight and capsule renderers may insert layers later using stations-layer
// as their anchor. Synchronize before painting instead of changing those callers.
export const bindStationCircleFrameLayerOrderSync = (map) => {
    const synchronize = () => {
        const frameLayerId = 'station-circles-frame-layer';
        const anchorLayerId = 'stations-layer';
        if (!map.getLayer(frameLayerId) || !map.getLayer(anchorLayerId)) return false;
        // MapLibre 3.6.2's order cache avoids serializing all GeoJSON sources on
        // every style update. This access stays inside the map service boundary.
        const order = map.style?._order;
        if (!Array.isArray(order)) return false;
        const frameIndex = order.indexOf(frameLayerId);
        const anchorIndex = order.indexOf(anchorLayerId);
        if (frameIndex < 0 || anchorIndex < 0 || frameIndex === anchorIndex - 1) return false;
        map.moveLayer(frameLayerId, anchorLayerId);
        return true;
    };
    map.on('styledata', synchronize);
    return () => map.off('styledata', synchronize);
};

// Optional adapter for the first rendering stage. The retained circle layer is
// the style/filter authority; only its presentation and hit geometry are replaced.
const createStationCircleFrameRuntime = (map) => {
    let renderer = null;
    let visibility = 'visible';
    const nativeQuery = map.queryRenderedFeatures.bind(map);
    const setVisibility = (value) => {
        visibility = value || 'visible';
        map.setLayoutProperty('stations-layer', 'visibility', renderer?.isActive() ? 'none' : visibility);
    };
    const query = (...args) => {
        const hits = nativeQuery(...args);
        if (!renderer?.isActive()) return hits;
        const first = args[0];
        const hasGeometry = Array.isArray(first) || (first && Number.isFinite(first.x) && Number.isFinite(first.y));
        const options = (hasGeometry ? args[1] : first) || {};
        if (options.layers && !options.layers.includes('stations-layer')) return hits;
        const geometry = hasGeometry ? first : null;
        let bounds = null;
        if (geometry) {
            const point = (p) => Array.isArray(p) ? { x: p[0], y: p[1] } : p;
            const box = Array.isArray(geometry) && (Array.isArray(geometry[0]) || typeof geometry[0] === 'object') ? geometry.map(point) : [point(geometry), point(geometry)];
            bounds = { left: Math.min(box[0].x, box[1].x), right: Math.max(box[0].x, box[1].x),
                top: Math.min(box[0].y, box[1].y), bottom: Math.max(box[0].y, box[1].y) };
        }
        const records = renderer.getRecords().filter((f) => {
            if (!bounds) return true;
            const { x, y } = f.screenPoint;
            const dx = Math.max(bounds.left - x, 0, x - bounds.right);
            const dy = Math.max(bounds.top - y, 0, y - bounds.bottom);
            return dx * dx + dy * dy <= f.radius * f.radius;
        }).slice().reverse();
        return [...records, ...hits.filter((f) => f.layer?.id !== 'stations-layer')];
    };
    const install = ({ geometry, getMode }) => {
        if (renderer) return renderer;
        const styleLayer = map.getLayer('stations-layer');
        if (!styleLayer?.paint?.get) return null;
        visibility = styleLayer.visibility || 'visible';
        let frozenZoom = map.getZoom();
        let previousMode = getMode?.() || 'dynamic';
        map.on('zoomend', () => { frozenZoom = map.getZoom(); });
        const onFailure = (error) => {
            console.warn('当前帧站点绘制失败，回退到原站点图层', error);
            map.setLayoutProperty('stations-layer', 'visibility', visibility);
            map.triggerRepaint();
        };
        renderer = createStationCircleFrameRenderer({
            geometry, onFailure,
            onReady: () => {
                map.queryRenderedFeatures = query;
                map.setLayoutProperty('stations-layer', 'visibility', 'none');
            },
            onDetach: () => {
                try {
                    if (map.getLayer('stations-layer')) map.setLayoutProperty('stations-layer', 'visibility', visibility);
                } catch {
                    // The whole style may already be gone during map teardown.
                }
            },
            getFrame: () => {
                const layer = map.getLayer('stations-layer');
                const zoom = map.getZoom();
                const mode = getMode?.() || 'dynamic';
                if (mode !== previousMode) { frozenZoom = zoom; previousMode = mode; }
                const evaluatePaint = (name, feature) => {
                    const value = layer.paint.get(name);
                    return typeof value?.evaluate === 'function' ? value.evaluate({ type: 1, properties: feature.properties }, {}) : value;
                };
                return { zoom, mode, frozenZoom, filter: layer.filter,
                    visible: visibility !== 'none' && zoom >= (layer.minzoom ?? 0) && zoom < (layer.maxzoom ?? 24),
                    width: map.transform.width, height: map.transform.height, cameraDistance: map.transform.cameraToCenterDistance,
                    centerMercatorX: (map.getCenter().lng + 180) / 360,
                    evaluate: (feature) => ({
                        radius: evaluatePaint('circle-radius', feature), strokeWidth: evaluatePaint('circle-stroke-width', feature),
                        fill: evaluatePaint('circle-color', feature), stroke: evaluatePaint('circle-stroke-color', feature),
                        pitchScale: evaluatePaint('circle-pitch-scale', feature),
                        opacity: evaluatePaint('circle-opacity', feature), strokeOpacity: evaluatePaint('circle-stroke-opacity', feature)
                    }) };
            }
        });
        map.addLayer(renderer.layer, 'stations-layer');
        if (renderer.isActive()) {
            // MapLibre's delegated layer events also call this instance method,
            // so click and hover share the exact geometry used by the new draw.
            map.queryRenderedFeatures = query;
            map.setLayoutProperty('stations-layer', 'visibility', 'none');
            map.triggerRepaint();
        }
        return renderer;
    };
    return { install, setVisibility, getRecords: () => renderer?.isActive() ? renderer.getRecords() : null };
};

// Optional stage-two adapter. Retained native layers remain the style/filter
// authority and export sources; the new service draws their current-frame shape.
const createTransferCapsuleFrameRuntime = (map) => {
    let configuration = null;
    let renderer = null;
    let geometry = [];
    let styles = [];
    let frozenZoom = map.getZoom();
    let previousMode = 'dynamic';
    const visibility = new Map();
    const restore = () => {
        for (const [id, value] of visibility) {
            try { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', value); } catch {}
        }
    };
    const hide = () => {
        for (const style of styles) {
            if (!visibility.has(style.id)) visibility.set(style.id, map.getLayer(style.id)?.visibility || 'visible');
            if (map.getLayer(style.id)?.visibility !== 'none') map.setLayoutProperty(style.id, 'visibility', 'none');
        }
    };
    const synchronizeOrder = () => {
        const anchor = map.getLayer('station-circles-frame-layer') ? 'station-circles-frame-layer' : 'stations-layer';
        const order = map.style?._order;
        if (!renderer || !map.getLayer(renderer.layer.id) || !map.getLayer(anchor) || !Array.isArray(order)) return;
        if (order.indexOf(renderer.layer.id) !== order.indexOf(anchor) - 1) map.moveLayer(renderer.layer.id, anchor);
    };
    const getFrame = () => {
        const zoom = map.getZoom();
        const mode = configuration?.getMode?.() || 'dynamic';
        if (mode !== previousMode) { frozenZoom = zoom; previousMode = mode; }
        return { zoom, mode, frozenZoom, width: map.transform.width, height: map.transform.height,
            cameraDistance: map.transform.cameraToCenterDistance, centerMercatorX: (map.getCenter().lng + 180) / 360,
            styles: styles.map((style) => {
                const layer = map.getLayer(style.id);
                const paint = (name, feature) => {
                    const value = layer.paint.get(name);
                    return typeof value?.evaluate === 'function' ? value.evaluate({ type: style.type === 'line' ? 2 : 1, properties: feature.properties }, {}) : value;
                };
                const prefix = style.type;
                return { ...style, filter: layer.filter,
                    visible: visibility.get(style.id) !== 'none' && zoom >= (layer.minzoom ?? 0) && zoom < (layer.maxzoom ?? 24),
                    evaluate: (feature) => ({
                        radius: style.type === 'line' ? paint('line-width', feature) / 2 : paint('circle-radius', feature),
                        opacity: paint(`${prefix}-opacity`, feature), color: paint(`${prefix}-color`, feature),
                        pitchScale: style.type === 'circle' ? paint('circle-pitch-scale', feature) : 'viewport'
                    }) };
            }) };
    };
    const install = (options) => {
        if (configuration) return configuration;
        configuration = options;
        frozenZoom = map.getZoom(); previousMode = options.getMode?.() || 'dynamic';
        map.on('zoomend', () => { frozenZoom = map.getZoom(); });
        map.on('styledata', synchronizeOrder);
        return configuration;
    };
    const update = ({ ids, frameGeometry }) => {
        if (!configuration || !frameGeometry) return null;
        geometry = frameGeometry;
        styles = [
            { id: ids.slaveOutlineLayerId, role: 'line', type: 'line' },
            { id: ids.slaveInnerLayerId, role: 'line', type: 'line' },
            { id: ids.fallbackCircleOutlineLayerId, role: 'fallback', type: 'circle' },
            { id: ids.fallbackCircleInnerLayerId, role: 'fallback', type: 'circle' },
            { id: ids.dotLayerId, role: 'dot', type: 'circle' }
        ];
        if (!renderer) {
            if (styles.some((style) => !map.getLayer(style.id)?.paint?.get)) return null;
            renderer = createTransferCapsuleFrameRenderer({ getFrame, getGeometry: () => geometry,
                onReady: hide, onDetach: restore,
                onFailure: (error) => { console.warn('当前帧换乘胶囊绘制失败，回退到原胶囊图层', error); restore(); map.triggerRepaint(); } });
            map.addLayer(renderer.layer, map.getLayer('station-circles-frame-layer') ? 'station-circles-frame-layer' : 'stations-layer');
        }
        if (renderer.isActive()) { hide(); synchronizeOrder(); map.triggerRepaint(); }
        return renderer;
    };
    return { install, update, owns: (id) => visibility.has(id),
        setVisibility: (id, value) => { visibility.set(id, value || 'visible'); map.setLayoutProperty(id, 'visibility', renderer?.isActive() ? 'none' : visibility.get(id)); },
        getRecords: () => renderer?.isActive() ? renderer.getRecords() : null };
};

// MapLibre 3.6.2 point symbols use Float32 dynamic anchor attributes for both
// glyphs and fitted backgrounds. Keep native shaping, collision, fading, paint
// and source/export data; synchronize these attributes immediately before draw.
const createStationLabelFrameRuntime = (map, version) => {
    const id = 'station-label-anchors-frame-layer';
    const labelId = 'station-labels-layer';
    let active = false;
    let records = [];
    let renderFrame = null;
    let captureRecords = null;
    let renderedZoom = null;
    let query = null;
    const cache = new WeakMap();
    const readTiles = (includeCached = false) => {
        const source = map.style?.sourceCaches?.['station-labels-source'];
        if (!source) return [];
        const layer = map.getLayer(labelId);
        const tiles = includeCached ? Object.values(source._tiles || {})
            : source.getVisibleCoordinates(true).map((coord) => source.getTile(coord));
        return layer ? tiles.map((tile) => ({ coord: tile.tileID, tile, bucket: tile?.getBucket(layer) }))
            .filter(({ bucket }) => bucket?.uploaded) : [];
    };
    const restore = () => {
        for (const { bucket } of readTiles(true)) {
            cache.get(bucket)?.restore();
            for (const buffers of [bucket.text, bucket.icon]) {
                if (buffers.dynamicLayoutVertexBuffer?.buffer) buffers.dynamicLayoutVertexBuffer.updateData(buffers.dynamicLayoutVertexArray);
            }
        }
    };
    const fail = (error) => {
        active = false;
        records = [];
        restore();
        console.warn('站名当前帧锚点同步不可用，回退到原站名绘制', error);
    };
    const install = ({ geometry, stationLabels, getMode }) => {
        if (renderFrame || version !== '3.6.2') return null;
        const byId = new Map(geometry.map((item) => [item.id, item]));
        let frozenZoom = map.getZoom();
        let previousMode = getMode?.() || 'dynamic';
        const synchronizeOrder = () => {
            const order = map.style?._order;
            if (map.getLayer(id) && map.getLayer(labelId)
                && order?.indexOf(id) !== order?.indexOf(labelId) - 1) map.moveLayer(id, labelId);
        };
        map.on('zoomend', () => { frozenZoom = map.getZoom(); });
        map.on('styledata', synchronizeOrder);
        renderFrame = () => {
            if (!active) return;
            const zoom = map.getZoom();
            const mode = getMode?.() || 'dynamic';
            if (mode !== previousMode) { frozenZoom = zoom; previousMode = mode; }
            const project = createStationFrameProjection(zoom, { mode, frozenZoom });
            records = [];
            try {
                const layer = map.getLayer(labelId);
                // Variable/line placement rewrites the same attributes during
                // draw. Reject it rather than silently claiming synchrony.
                if (layer?.layout.get('symbol-placement') !== 'point'
                    || layer._unevaluatedLayout.hasValue('text-variable-anchor')
                    || layer._unevaluatedLayout.hasValue('text-variable-anchor-offset')) throw new Error('Unsupported label placement');
                if (!layer.isHidden(zoom)) for (const { coord, tile, bucket } of readTiles()) {
                    let anchors = cache.get(bucket);
                    if (!anchors) {
                        // Fading buckets can retain older source data. Use the
                        // matching index held by native symbol placement.
                        const featureIndex = map.style.placement.retainedQueryData[bucket.bucketInstanceId]?.featureIndex
                            || tile.latestFeatureIndex;
                        const features = featureIndex.loadVTLayers()._geojsonTileLayer;
                        anchors = createStationLabelAnchorBuffers({ text: bucket.text, icon: bucket.icon,
                            instances: bucket.symbolInstances,
                            getStationId: (index) => String(features.feature(index).properties.id || '') });
                        cache.set(bucket, anchors);
                    }
                    const scale = 2 ** coord.canonical.z;
                    for (const part of anchors.parts) {
                        const item = byId.get(part.id);
                        if (!item) continue;
                        const point = project(item);
                        anchors.move(part, { x: (point.x * scale - coord.canonical.x) * 8192,
                            y: (point.y * scale - coord.canonical.y) * 8192 });
                    }
                    for (const buffers of [bucket.text, bucket.icon]) {
                        buffers.dynamicLayoutVertexBuffer?.updateData(buffers.dynamicLayoutVertexArray);
                    }
                }
                // DOM markers are retained for all/pinned labels, including
                // their CSS translates, click handlers and selected/chip skin.
                for (const label of stationLabels) {
                    const item = byId.get(label.stationId);
                    if (!item) continue;
                    const point = project(item);
                    label.coordinates = stationFramePointToLngLat(point);
                    if (!label.marker) continue;
                    label.marker.setLngLat(label.coordinates);
                    // setLngLat rounds in 3.6.2; the normal move update does not.
                    label.marker._update({ type: 'move' });
                }
                renderedZoom = zoom;
            } catch (error) { fail(error); }
        };
        // Capture the buffer actually submitted to native symbol rendering,
        // after draw, instead of reporting a requested source coordinate.
        captureRecords = () => {
            if (!active) return;
            const zoom = renderedZoom;
            const layer = map.getLayer(labelId);
            const next = [];
            if (layer && !layer.isHidden(zoom)) for (const { coord, bucket } of readTiles()) {
                const matrix = coord.posMatrix;
                for (const part of cache.get(bucket)?.parts || []) {
                    const range = part.ranges.find(({ buffers, start }) => {
                        if (buffers !== bucket.text || !buffers.hasVisibleVertices) return false;
                        const packed = buffers.opacityVertexArray.uint8[start];
                        const fade = map.painter.options.fadeDuration ? map.painter.symbolFadeChange : 1;
                        return (packed >> 1) / 127 + (packed & 1 ? fade : -fade) > 0.01;
                    });
                    if (!range) continue;
                    const { buffers, start } = range;
                    const array = buffers.dynamicLayoutVertexArray.float32;
                    const x = array[start * 3], y = array[start * 3 + 1];
                    const w = matrix[3] * x + matrix[7] * y + matrix[15];
                    const screenPoint = { x: ((matrix[0] * x + matrix[4] * y + matrix[12]) / w + 1) * map.transform.width / 2,
                        y: (1 - (matrix[1] * x + matrix[5] * y + matrix[13]) / w) * map.transform.height / 2 };
                    const coordinates = stationFramePointToLngLat({
                        x: (coord.canonical.x + x / 8192) / 2 ** coord.canonical.z + coord.wrap,
                        y: (coord.canonical.y + y / 8192) / 2 ** coord.canonical.z });
                    const layout = buffers.layoutVertexArray.int16;
                    const oldX = layout[start * 12], oldY = layout[start * 12 + 1];
                    const oldW = matrix[3] * oldX + matrix[7] * oldY + matrix[15];
                    const nativeAnchor = { x: ((matrix[0] * oldX + matrix[4] * oldY + matrix[12]) / oldW + 1) * map.transform.width / 2,
                        y: (1 - (matrix[1] * oldX + matrix[5] * oldY + matrix[13]) / oldW) * map.transform.height / 2 };
                    next.push({ type: 'Feature', properties: { id: part.id },
                        geometry: { type: 'Point', coordinates }, screenPoint, renderedZoom: zoom,
                        renderer: 'native-symbol-anchor-buffer', nativeAnchor, bounds: part.bounds });
                }
            }
            for (const label of stationLabels) {
                if (!label.marker || !label.el.isConnected || label.el.style.display === 'none') continue;
                const style = getComputedStyle(label.el);
                if (style.display === 'none' || style.visibility === 'hidden') continue;
                const matrix = new DOMMatrixReadOnly(style.transform);
                const rect = label.el.getBoundingClientRect();
                next.push({ type: 'Feature', properties: { id: label.stationId },
                    geometry: { type: 'Point', coordinates: label.marker.getLngLat().toArray() },
                    screenPoint: { x: matrix.m41 + rect.width / 2, y: matrix.m42 + rect.height },
                    renderedZoom: zoom, renderer: 'dom-marker-transform' });
            }
            records = next.filter(({ screenPoint: p }) => p.x >= 0 && p.y >= 0
                && p.x <= map.transform.width && p.y <= map.transform.height);
            return records;
        };
        map.addLayer({ id, type: 'custom', renderingMode: '2d',
            onAdd: () => { active = true; if (query) map.queryRenderedFeatures = query; }, render: renderFrame,
            onRemove: () => { active = false; records = []; restore(); map.off('styledata', synchronizeOrder); } }, labelId);
        const nativeQuery = map.queryRenderedFeatures.bind(map);
        // Retain native collision/filter hit testing, translating each queried
        // region back to its retained anchor. Clicks follow the displayed label.
        query = (...args) => {
            const hits = nativeQuery(...args);
            const first = args[0];
            const hasGeometry = Array.isArray(first) || Number.isFinite(first?.x);
            const options = (hasGeometry ? args[1] : first) || {};
            if (!active || !hasGeometry || (options.layers && !options.layers.includes(labelId))
                || map.getLayer(labelId)?.isHidden(map.getZoom())) return hits;
            const toPoint = (p) => Array.isArray(p) ? { x: p[0], y: p[1] } : p;
            const isBox = Array.isArray(first) && (Array.isArray(first[0]) || typeof first[0] === 'object');
            const points = isBox ? first.map(toPoint) : [toPoint(first)];
            const left = Math.min(...points.map((p) => p.x)), right = Math.max(...points.map((p) => p.x));
            const top = Math.min(...points.map((p) => p.y)), bottom = Math.max(...points.map((p) => p.y));
            const labels = [];
            for (const record of captureRecords()) {
                if (!record.nativeAnchor) continue;
                const { screenPoint: p, bounds: b, nativeAnchor: old } = record;
                if (map.getPitch() === 0 && (p.x + b.right + 4 < left || p.x + b.left - 4 > right
                    || p.y + b.bottom + 4 < top || p.y + b.top - 4 > bottom)) continue;
                const translated = points.map((point) => [point.x + old.x - p.x, point.y + old.y - p.y]);
                const matching = nativeQuery(isBox ? translated : translated[0], { ...options, layers: [labelId] })
                    .find((feature) => String(feature.properties?.id) === record.properties.id);
                if (matching) labels.push({ ...matching, geometry: record.geometry });
            }
            return [...hits.filter((feature) => feature.layer?.id !== labelId), ...labels];
        };
        map.queryRenderedFeatures = query;
        return { isActive: () => active };
    };
    return { install, getRecords: () => active ? captureRecords?.() || [] : null };
};

export const createMapEngine = ({ maplibregl, container, center, zoom, style, localIdeographFontFamily = 'sans-serif', stationCircleFrameRendering = false, stationCircleFrameLayerOrderSync = false, transferCapsuleFrameRendering = false, stationLabelFrameAnchors = false } = {}) => {
    if (!maplibregl?.Map) {
        throw new Error('MapLibre GL JS is not available');
    }

    const containerEl = typeof container === 'string' && typeof document !== 'undefined'
        ? document.getElementById(container)
        : container;
    const canCleanContainer = Boolean(containerEl && typeof containerEl.removeChild === 'function');

    if (canCleanContainer) {
        try {
            containerEl.__tokyoRailMapLibreInstance?.remove?.();
        } catch {
            // ignore stale MapLibre cleanup errors
        }
        while (containerEl.firstChild) {
            containerEl.removeChild(containerEl.firstChild);
        }
    }

    const map = new maplibregl.Map({
        container: containerEl || container,
        center,
        zoom,
        style,
        attributionControl: false,
        localIdeographFontFamily
    });
    const stationCircleFrameRuntime = stationCircleFrameRendering ? createStationCircleFrameRuntime(map) : null;
    if (stationCircleFrameLayerOrderSync) bindStationCircleFrameLayerOrderSync(map);
    const transferCapsuleFrameRuntime = transferCapsuleFrameRendering ? createTransferCapsuleFrameRuntime(map) : null;
    const stationLabelFrameRuntime = stationLabelFrameAnchors ? createStationLabelFrameRuntime(map, maplibregl.version) : null;
    const geoJsonSourcesReadyForDiff = new WeakSet();
    const latestGeoJsonUpdateStateBySource = new WeakMap();
    const observesGeoJsonSourceReadiness = typeof map.on === 'function';

    const applyGeoJsonSourceDataUpdate = (source, data, options = {}) => {
        if (!source) return false;

        const fallbackData = typeof options?.fallbackData === 'function'
            ? options.fallbackData()
            : (options?.fallbackData || data);
        const canUseDiff = typeof source.updateData === 'function'
            && (!observesGeoJsonSourceReadiness || geoJsonSourcesReadyForDiff.has(source));
        const diff = canUseDiff
            ? buildGeoJsonUpdateDiff(data, {
                featureIds: options?.featureIds,
                promoteId: options?.promoteId
            })
            : null;

        if (diff && diff.update.length) {
            try {
                source.updateData(diff);
                if ('_data' in source) source._data = fallbackData;
                return true;
            } catch {
                // Fall back to the legacy full-source update below.
            }
        } else if (diff && options?.replaceDataOnEmptyDiff !== true) {
            return false;
        }

        if (typeof source.setData !== 'function') return false;
        source.setData(fallbackData);
        return true;
    };

    const getLatestGeoJsonUpdateState = (source) => {
        let state = latestGeoJsonUpdateStateBySource.get(source);
        if (state) return state;
        state = {
            inFlight: false,
            pending: null
        };
        latestGeoJsonUpdateStateBySource.set(source, state);
        return state;
    };

    const flushLatestGeoJsonSourceData = (source) => {
        const state = latestGeoJsonUpdateStateBySource.get(source);
        if (!state || state.inFlight || !state.pending) return false;
        if (observesGeoJsonSourceReadiness && !geoJsonSourcesReadyForDiff.has(source)) return false;

        const request = state.pending;
        state.pending = null;
        state.inFlight = applyGeoJsonSourceDataUpdate(source, request.data, request.options);
        return state.inFlight;
    };

    const settleLatestGeoJsonSourceData = (source, { markReady = false } = {}) => {
        if (!source || typeof source !== 'object') return;
        if (markReady) geoJsonSourcesReadyForDiff.add(source);
        const state = latestGeoJsonUpdateStateBySource.get(source);
        if (!state) return;
        state.inFlight = false;
        flushLatestGeoJsonSourceData(source);
    };

    if (observesGeoJsonSourceReadiness) {
        map.on('sourcedata', (event) => {
            if (event?.sourceDataType !== 'content') return;
            const sourceId = String(event?.sourceId || '').trim();
            if (!sourceId) return;
            settleLatestGeoJsonSourceData(map.getSource?.(sourceId), { markReady: true });
        });
        map.on('sourcedataabort', (event) => {
            const sourceId = String(event?.sourceId || '').trim();
            if (!sourceId) return;
            settleLatestGeoJsonSourceData(map.getSource?.(sourceId));
        });
    }

    if (canCleanContainer) {
        containerEl.__tokyoRailMapLibreInstance = map;
    }

    const ensureGeoJsonSource = (sourceId, data) => {
        if (!sourceId) return null;
        const existing = map.getSource(sourceId);
        if (existing) return existing;

        map.addSource(sourceId, {
            type: 'geojson',
            data: data || { type: 'FeatureCollection', features: [] }
        });
        return map.getSource(sourceId);
    };

    const ensureLayer = (layerDef, beforeLayerId) => {
        const layerId = layerDef?.id;
        if (!layerId) return null;
        const existing = map.getLayer(layerId);
        if (!existing) {
            if (beforeLayerId) map.addLayer(layerDef, beforeLayerId);
            else map.addLayer(layerDef);
            return map.getLayer(layerId);
        }
        if (beforeLayerId) {
            try {
                map.moveLayer(layerId, beforeLayerId);
            } catch {
                // keep existing layer order if MapLibre rejects the move
            }
        }
        return existing;
    };

    const applyPaintProperties = (layerId, paint = {}) => {
        if (!layerId || !map.getLayer(layerId)) return false;
        Object.entries(paint || {}).forEach(([property, value]) => {
            map.setPaintProperty(layerId, property, value);
        });
        return true;
    };

    const setLayerFilter = (layerId, filterExpr) => {
        if (!layerId || !map.getLayer(layerId)) return false;
        map.setFilter(layerId, filterExpr);
        return true;
    };

    const ensurePmtilesProtocol = () => {
        if (pmtilesProtocolTargets.has(maplibregl)) return true;
        const Protocol = globalThis.pmtiles?.Protocol;
        if (typeof maplibregl.addProtocol !== 'function' || (typeof Protocol !== 'function' && typeof globalThis.pmtiles?.PMTiles !== 'function')) {
            return false;
        }
        const protocol = createRangeSafePmtilesProtocol(globalThis.pmtiles) || new Protocol();
        maplibregl.addProtocol('pmtiles', protocol.tile);
        pmtilesProtocolTargets.add(maplibregl);
        return true;
    };

    const lineHighlightLabelMarkers = new Map();

    const toLabelText = (value) => String(value ?? '').trim();

    const createLineHighlightLabelElement = (item = {}) => {
        if (typeof document === 'undefined') return null;
        const color = toLabelText(item.color) || '#2f6fdf';
        const iconText = toLabelText(item.iconText);
        const lineName = toLabelText(item.lineName) || toLabelText(item.lineId);
        if (!lineName) return null;

        const el = document.createElement('div');
        el.className = 'map-line-highlight-label';
        el.style.setProperty('--line-highlight-label-color', color);

        const icon = document.createElement('span');
        icon.className = iconText
            ? 'map-line-highlight-label-icon'
            : 'map-line-highlight-label-icon map-line-highlight-label-icon-dot';
        icon.textContent = iconText;

        const name = document.createElement('span');
        name.className = 'map-line-highlight-label-name';
        name.textContent = lineName;

        el.append(icon, name);
        return el;
    };

    const getLineHighlightLabelSignature = (item = {}) => [
        toLabelText(item.lineId),
        toLabelText(item.lineName),
        toLabelText(item.iconText),
        toLabelText(item.color)
    ].join('|');

    const normalizeLineHighlightLabelItem = (item = {}) => {
        const lineId = toLabelText(item.lineId);
        const coordinate = Array.isArray(item.coordinate) ? item.coordinate : null;
        const lng = Number(coordinate?.[0]);
        const lat = Number(coordinate?.[1]);
        if (!lineId || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        return {
            lineId,
            coordinate: [lng, lat],
            lineName: toLabelText(item.lineName) || lineId,
            iconText: toLabelText(item.iconText),
            color: toLabelText(item.color)
        };
    };

    const clearLineHighlightLabels = () => {
        for (const entry of lineHighlightLabelMarkers.values()) {
            try {
                entry?.marker?.remove?.();
            } catch {
                // ignore stale marker cleanup errors
            }
        }
        lineHighlightLabelMarkers.clear();
    };

    const renderLineHighlightLabels = (items = []) => {
        if (!Array.isArray(items) || !items.length) {
            clearLineHighlightLabels();
            return 0;
        }

        const normalizedItems = items
            .map(normalizeLineHighlightLabelItem)
            .filter(Boolean);
        const nextIds = new Set(normalizedItems.map((item) => item.lineId));

        for (const [lineId, entry] of lineHighlightLabelMarkers.entries()) {
            if (nextIds.has(lineId)) continue;
            try {
                entry?.marker?.remove?.();
            } catch {
                // ignore stale marker cleanup errors
            }
            lineHighlightLabelMarkers.delete(lineId);
        }

        for (const item of normalizedItems) {
            const signature = getLineHighlightLabelSignature(item);
            const existing = lineHighlightLabelMarkers.get(item.lineId);
            if (existing && existing.signature === signature) {
                existing.marker?.setLngLat?.(item.coordinate);
                continue;
            }

            if (existing) {
                try {
                    existing.marker?.remove?.();
                } catch {
                    // ignore stale marker cleanup errors
                }
            }

            const element = createLineHighlightLabelElement(item);
            if (!element) continue;
            const marker = new maplibregl.Marker({
                element,
                anchor: 'center',
                offset: [0, -18]
            }).setLngLat(item.coordinate);
            marker.addTo(map);
            lineHighlightLabelMarkers.set(item.lineId, { marker, signature });
        }

        return lineHighlightLabelMarkers.size;
    };

    return {
        getMap: () => map,
        installStationCircleFrameRenderer: (options) => stationCircleFrameRuntime?.install(options) || null,
        getRenderedStationCircles: () => stationCircleFrameRuntime?.getRecords() || null,
        installTransferCapsuleFrameRenderer: (options) => transferCapsuleFrameRuntime?.install(options) || null,
        updateTransferCapsuleFrameRenderer: (options) => transferCapsuleFrameRuntime?.update(options) || null,
        getRenderedTransferCapsules: () => transferCapsuleFrameRuntime?.getRecords() || null,
        installStationLabelFrameAnchors: (options) => stationLabelFrameRuntime?.install(options) || null,
        getRenderedStationLabelAnchors: () => stationLabelFrameRuntime?.getRecords() || null,
        addMetricScaleControl: ({ maxWidth = 100, position = 'bottom-left' } = {}) => {
            map.addControl(
                new maplibregl.ScaleControl({ maxWidth, unit: 'metric' }),
                position
            );
        },
        on: (...args) => map.on(...args),
        off: (...args) => map.off(...args),
        once: (...args) => map.once(...args),
        isLoaded: () => Boolean(map.loaded?.()),
        isStyleLoaded: () => Boolean(map.isStyleLoaded?.()),
        areTilesLoaded: () => Boolean(map.areTilesLoaded?.()),
        addControl: (...args) => map.addControl(...args),
        easeTo: (...args) => map.easeTo?.(...args),
        fitBounds: (...args) => map.fitBounds(...args),
        flyTo: (...args) => map.flyTo(...args),
        jumpTo: (...args) => map.jumpTo?.(...args),
        resize: (...args) => map.resize(...args),
        getBearing: (...args) => map.getBearing(...args),
        getBounds: (...args) => map.getBounds(...args),
        getCenter: (...args) => map.getCenter(...args),
        getPitch: (...args) => map.getPitch(...args),
        getZoom: (...args) => map.getZoom(...args),
        project: (...args) => map.project(...args),
        setPaintProperty: (...args) => map.setPaintProperty(...args),
        setLayoutProperty: (...args) => args[0] === 'stations-layer' && args[1] === 'visibility' && stationCircleFrameRuntime
            ? stationCircleFrameRuntime.setVisibility(args[2])
            : args[1] === 'visibility' && transferCapsuleFrameRuntime?.owns(args[0])
                ? transferCapsuleFrameRuntime.setVisibility(args[0], args[2]) : map.setLayoutProperty(...args),
        setFilter: (...args) => map.setFilter(...args),
        moveLayer: (...args) => map.moveLayer(...args),
        addSource: (...args) => map.addSource(...args),
        addLayer: (...args) => map.addLayer(...args),
        addImage: (...args) => map.addImage(...args),
        removeLayer: (...args) => map.removeLayer(...args),
        removeSource: (...args) => map.removeSource(...args),
        getLayer: (...args) => map.getLayer(...args),
        hasImage: (...args) => map.hasImage(...args),
        getSource: (...args) => map.getSource(...args),
        getCanvas: (...args) => map.getCanvas(...args),
        hasLayer: (layerId) => Boolean(layerId && map.getLayer(layerId)),
        queryRenderedFeatures: (...args) => map.queryRenderedFeatures(...args),
        applyPaintProperties,
        ensureGeoJsonSource,
        ensureLayer,
        ensurePmtilesProtocol,
        onMapClick: (listener) => {
            if (typeof listener !== 'function') return () => {};
            map.on('click', listener);
            return () => map.off('click', listener);
        },
        onLayerHover: (layerId, { onEnter, onMove, onLeave } = {}) => {
            if (!layerId) return () => {};
            if (typeof onEnter === 'function') map.on('mouseenter', layerId, onEnter);
            if (typeof onMove === 'function') map.on('mousemove', layerId, onMove);
            if (typeof onLeave === 'function') map.on('mouseleave', layerId, onLeave);
            return () => {
                if (typeof onEnter === 'function') map.off('mouseenter', layerId, onEnter);
                if (typeof onMove === 'function') map.off('mousemove', layerId, onMove);
                if (typeof onLeave === 'function') map.off('mouseleave', layerId, onLeave);
            };
        },
        setCursor: (cursor = '') => {
            const canvas = map.getCanvas?.();
            if (canvas?.style) canvas.style.cursor = cursor;
        },
        setLayerVisibility: (layerId, visible = true) => {
            if (!layerId || !map.getLayer(layerId)) return false;
            if (layerId === 'stations-layer' && stationCircleFrameRuntime) stationCircleFrameRuntime.setVisibility(visible === false ? 'none' : 'visible');
            else if (transferCapsuleFrameRuntime?.owns(layerId)) transferCapsuleFrameRuntime.setVisibility(layerId, visible === false ? 'none' : 'visible');
            else map.setLayoutProperty(layerId, 'visibility', visible === false ? 'none' : 'visible');
            return true;
        },
        setLayerFilter,
        setSourceData: (sourceId, data) => {
            const source = map.getSource(sourceId);
            source?.setData?.(data);
            return source;
        },
        updateGeoJsonSourceData: (sourceId, data, options = {}) => {
            const source = map.getSource(sourceId);
            if (!source) return source;
            applyGeoJsonSourceDataUpdate(source, data, options);
            return source;
        },
        updateGeoJsonSourceDataLatest: (sourceId, data, options = {}) => {
            const source = map.getSource(sourceId);
            if (!source) return source;
            if (!observesGeoJsonSourceReadiness) {
                applyGeoJsonSourceDataUpdate(source, data, options);
                return source;
            }

            const state = getLatestGeoJsonUpdateState(source);
            state.pending = { data, options };
            flushLatestGeoJsonSourceData(source);
            return source;
        },
        clearLineHighlightLabels,
        renderLineHighlightLabels,
        updateGeoJsonSource: (sourceId, data) => {
            const source = ensureGeoJsonSource(sourceId, data);
            source?.setData?.(data || { type: 'FeatureCollection', features: [] });
            return source;
        },
        createMarker: (options = {}) => new maplibregl.Marker(options),
        addMarker: (marker) => marker?.addTo?.(map),
        createPopup: (options = {}) => new maplibregl.Popup(options),
        addPopup: (popup) => popup?.addTo?.(map)
    };
};

const OSM_VECTOR_SOURCE_ID = 'osm-vector-source';
export const BASEMAP_GLYPHS_URL = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';

const getBasemapBackgroundColor = (theme) => (
    getBasemapPalette(theme).background
);

const getLayerVisibility = (mode, modes) => (
    modes.includes(mode) ? 'visible' : 'none'
);

const createTextField = () => ([
    'coalesce',
    ['get', 'name:ja'],
    ['get', 'name:en'],
    ['get', 'name']
]);

const BASEMAP_PALETTES = {
    light: {
        background: '#f8f7f1',
        water: '#c9dce2',
        waterDetailed: '#abcbd7',
        forest: '#ccdbc3',
        grass: '#d9e2cf',
        farmland: '#e1dfce',
        wetland: '#d2dcda',
        rock: '#d5d1c9',
        sand: '#e4ddcc',
        landcover: '#e5e3db',
        landuse: '#ece9e1',
        park: '#d5dfd2',
        urban: '#ece8df',
        industry: '#e7e0d8',
        building: '#ded8cf',
        road: '#e7e5db',
        roadDetailed: '#b0bac4',
        roadMinor: '#d3cec5',
        text: '#343b44',
        textHalo: '#fffdf8',
        poiText: '#69727b'
    },
    dark: {
        background: '#101418',
        water: '#243746',
        waterDetailed: '#2b4554',
        forest: '#2c352f',
        grass: '#303830',
        farmland: '#38382e',
        wetland: '#2b3c3d',
        rock: '#3a3732',
        sand: '#403b31',
        landcover: '#2b2f2d',
        landuse: '#20252a',
        park: '#2c3b32',
        urban: '#23272d',
        industry: '#2d2930',
        building: '#30343a',
        road: '#252a30',
        roadDetailed: '#606a76',
        roadMinor: '#3f4650',
        text: '#e1e6ea',
        textHalo: '#0d1115',
        poiText: '#b7c0c8'
    }
};

const getBasemapPalette = (theme) => (
    theme === 'dark' ? BASEMAP_PALETTES.dark : BASEMAP_PALETTES.light
);

const createLandcoverColorExpression = (palette) => ([
    'match',
    ['get', 'class'],
    'wood',
    palette.forest,
    'grass',
    palette.grass,
    'farmland',
    palette.farmland,
    'wetland',
    palette.wetland,
    'rock',
    palette.rock,
    'sand',
    palette.sand,
    palette.landcover
]);

const createLanduseColorExpression = (palette) => ([
    'match',
    ['get', 'class'],
    ['park', 'grass', 'recreation_ground', 'zoo'],
    palette.park,
    ['commercial', 'retail', 'residential', 'school', 'university', 'hospital'],
    palette.urban,
    ['industrial', 'railway', 'military', 'quarry'],
    palette.industry,
    palette.landuse
]);

const createMunicipalityPlaceFilter = () => ([
    'match',
    ['get', 'class'],
    ['city', 'town', 'village'],
    true,
    false
]);

const createOsmBasemapSource = (pmtilesUrl) => ({
    type: 'vector',
    tiles: [toPmtilesTileTemplate(pmtilesUrl)],
    minzoom: 0,
    maxzoom: 14,
    attribution: OSM_BASEMAP_ATTRIBUTION_HTML
});

const createOsmBasemapLayerItems = ({ mode = DEFAULT_BASEMAP_MODE, theme = 'light' } = {}) => {
    const dark = theme === 'dark';
    const palette = getBasemapPalette(theme);
    const textColor = palette.text;
    const textHalo = palette.textHalo;
    const roadColor = palette.road;
    const detailedRoadColor = palette.roadDetailed;

    return [
        {
            modes: ['osm-white', 'osm-detailed'],
            layer: {
                id: 'osm-water-layer',
                type: 'fill',
                source: OSM_VECTOR_SOURCE_ID,
                'source-layer': 'water',
                paint: {
                    'fill-color': mode === 'osm-detailed' ? palette.waterDetailed : palette.water,
                    'fill-opacity': mode === 'osm-detailed' ? 0.82 : 0.72
                }
            }
        },
        {
            modes: ['osm-white', 'osm-detailed'],
            layer: {
                id: 'osm-landcover-layer',
                type: 'fill',
                source: OSM_VECTOR_SOURCE_ID,
                'source-layer': 'landcover',
                paint: {
                    'fill-color': createLandcoverColorExpression(palette),
                    'fill-opacity': mode === 'osm-detailed' ? 0.72 : 0.48
                }
            }
        },
        {
            modes: ['osm-detailed'],
            layer: {
                id: 'osm-landuse-layer',
                type: 'fill',
                source: OSM_VECTOR_SOURCE_ID,
                'source-layer': 'landuse',
                paint: {
                    'fill-color': createLanduseColorExpression(palette),
                    'fill-opacity': 0.54
                }
            }
        },
        {
            modes: ['osm-detailed'],
            layer: {
                id: 'osm-building-layer',
                type: 'fill',
                source: OSM_VECTOR_SOURCE_ID,
                'source-layer': 'building',
                minzoom: 13,
                paint: {
                    'fill-color': palette.building,
                    'fill-opacity': dark ? 0.62 : 0.58
                }
            }
        },
        {
            modes: ['osm-white', 'osm-detailed'],
            layer: {
                id: 'osm-road-layer',
                type: 'line',
                source: OSM_VECTOR_SOURCE_ID,
                'source-layer': 'transportation',
                filter: [
                    'match',
                    ['get', 'class'],
                    ['motorway', 'trunk', 'primary', 'secondary'],
                    true,
                    false
                ],
                paint: {
                    'line-color': mode === 'osm-detailed' ? detailedRoadColor : roadColor,
                    'line-width': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        8,
                        mode === 'osm-detailed' ? 0.35 :0.16,
                        14,
                        mode === 'osm-detailed' ? 1.4 : 0.45
                    ],
                    'line-opacity': mode === 'osm-detailed' ? 0.82 : 0.5
                }
            }
        },
        {
            modes: ['osm-detailed'],
            layer: {
                id: 'osm-road-minor-layer',
                type: 'line',
                source: OSM_VECTOR_SOURCE_ID,
                'source-layer': 'transportation',
                minzoom: 12,
                filter: [
                    'match',
                    ['get', 'class'],
                    ['minor', 'service', 'track', 'path'],
                    true,
                    false
                ],
                paint: {
                    'line-color': palette.roadMinor,
                    'line-width': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        12,
                        0.25,
                        16,
                        1.1
                    ],
                    'line-opacity': 0.7
                }
            }
        },
        {
            modes: ['osm-detailed'],
            layer: {
                id: 'osm-poi-label-layer',
                type: 'symbol',
                source: OSM_VECTOR_SOURCE_ID,
                'source-layer': 'poi',
                minzoom: 14,
                layout: {
                    'text-field': createTextField(),
                    'text-size': 11,
                    'text-anchor': 'top',
                    'text-offset': [0, 0.7],
                    'text-allow-overlap': false
                },
                paint: {
                    'text-color': palette.poiText,
                    'text-halo-color': textHalo,
                    'text-halo-width': 1
                }
            }
        },
        {
            modes: ['osm-white', 'osm-detailed'],
            layer: {
                id: 'osm-place-label-layer',
                type: 'symbol',
                source: OSM_VECTOR_SOURCE_ID,
                'source-layer': 'place',
                filter: createMunicipalityPlaceFilter(),
                layout: {
                    'text-field': createTextField(),
                    'text-size': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        6,
                        mode === 'osm-detailed' ? 11.5 : 10.5,
                        12,
                        mode === 'osm-detailed' ? 15.5 : 13.5
                    ],
                    'symbol-sort-key': ['coalesce', ['get', 'rank'], 20],
                    'text-allow-overlap': false
                },
                paint: {
                    'text-color': textColor,
                    'text-halo-color': textHalo,
                    'text-halo-width': dark ? 1.4 : 1.1
                }
            }
        }
    ].map((item) => ({
        ...item,
        layer: {
            ...item.layer,
            layout: {
                ...(item.layer.layout || {}),
                visibility: getLayerVisibility(mode, item.modes)
            }
        }
    }));
};

const getOsmBasemapLayerIds = () => (
    createOsmBasemapLayerItems().map((item) => item.layer.id)
);

export const createOsmBasemapStyle = ({
    mode = DEFAULT_BASEMAP_MODE,
    theme = 'light',
    pmtilesAvailable = true,
    pmtilesUrl = DEFAULT_OSM_BASEMAP_PMTILES_URL
} = {}) => {
    const nextMode = normalizeBasemapMode(mode);
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    const layers = nextMode === 'transparent' || !pmtilesAvailable
        ? []
        : createOsmBasemapLayerItems({ mode: nextMode, theme: nextTheme })
            .filter((item) => item.modes.includes(nextMode))
            .map((item) => item.layer);

    return {
        version: 8,
        glyphs: BASEMAP_GLYPHS_URL,
        sources: pmtilesAvailable
            ? { [OSM_VECTOR_SOURCE_ID]: createOsmBasemapSource(pmtilesUrl) }
            : {},
        layers: [
            {
                id: 'tokyo-basemap-background-layer',
                type: 'background',
                paint: {
                    'background-color': getBasemapBackgroundColor(nextTheme),
                    'background-opacity': 1
                }
            },
            ...layers
        ]
    };
};

const createBackgroundBasemapStyle = (theme = 'light', backgroundColor) => ({
    version: 8,
    glyphs: BASEMAP_GLYPHS_URL,
    sources: {},
    layers: [
        {
            id: 'tokyo-basemap-background-layer',
            type: 'background',
            paint: {
                'background-color': backgroundColor || getBasemapBackgroundColor(theme),
                'background-opacity': 1
            }
        }
    ],
    metadata: {
        tokyoRailBasemap: {
            sourceKind: 'none',
            primarySourceId: null
        }
    }
});

const createOnlineBasemapExportStyle = (descriptor, theme = 'light') => {
    if (!descriptor?.style) return createBackgroundBasemapStyle(theme);
    return {
        ...descriptor.style,
        layers: [
            createBackgroundBasemapStyle(theme, descriptor.backgroundColor).layers[0],
            ...(descriptor.style.layers || [])
        ],
        metadata: {
            ...(descriptor.style.metadata || {}),
            tokyoRailBasemap: {
                ...(descriptor.style.metadata?.tokyoRailBasemap || {}),
                sourceKind: 'openfreemap',
                primarySourceId: descriptor.primarySourceId || null
            }
        }
    };
};

export const createBasemapController = ({
    mapEngine,
    initialTheme = 'light',
    initialMode = DEFAULT_BASEMAP_MODE,
    pmtilesAvailable = true,
    pmtilesUrl = DEFAULT_OSM_BASEMAP_PMTILES_URL,
    onThemeChanged
} = {}) => {
    if (!mapEngine) {
        throw new Error('basemapController requires mapEngine');
    }

    let theme = initialTheme === 'dark' ? 'dark' : 'light';
    let mode = normalizeBasemapMode(initialMode);
    let hasPmtilesArchive = pmtilesAvailable === true;
    let activeBasemapSourceKind = hasPmtilesArchive ? BASEMAP_SOURCE_PMTILES : 'none';
    let onlineBasemapStyle = null;
    const backgroundLayerId = 'tokyo-basemap-background-layer';
    const basemapLayerIds = Object.freeze(getOsmBasemapLayerIds());

    const shouldUseOnlineBasemap = () => (
        activeBasemapSourceKind === BASEMAP_SOURCE_OPENFREEMAP
        && mode !== 'transparent'
        && onlineBasemapStyle?.style
    );
    const shouldUsePmtilesBasemap = () => (
        activeBasemapSourceKind === BASEMAP_SOURCE_PMTILES
        && hasPmtilesArchive
        && mode !== 'transparent'
    );
    const getBackgroundColor = () => (
        shouldUseOnlineBasemap()
            ? onlineBasemapStyle.backgroundColor
            : getBasemapBackgroundColor(theme)
    );
    const getOverlayAnchorLayerId = () => (
        mapEngine.getLayer('lines-layer')
            ? 'lines-layer'
            : (mapEngine.getLayer('stations-layer') ? 'stations-layer' : undefined)
    );
    const getActiveBasemapLayerIds = () => [
        ...basemapLayerIds,
        ...(onlineBasemapStyle?.layerIds || [])
    ];
    const getFirstBasemapLayerId = () => getActiveBasemapLayerIds().find((layerId) => mapEngine.getLayer(layerId)) || null;

    const removeLayers = (layerIds = []) => {
        for (const layerId of [...layerIds].reverse()) {
            try {
                if (layerId && mapEngine.getLayer(layerId)) mapEngine.removeLayer?.(layerId);
            } catch {
                // ignore cleanup races during style changes
            }
        }
    };

    const removeSources = (sourceIds = []) => {
        for (const sourceId of sourceIds) {
            try {
                if (sourceId && mapEngine.getSource(sourceId)) mapEngine.removeSource?.(sourceId);
            } catch {
                // ignore cleanup races during style changes
            }
        }
    };

    const cleanupPmtilesBasemap = () => {
        removeLayers(basemapLayerIds);
        removeSources([OSM_VECTOR_SOURCE_ID]);
    };

    const cleanupOnlineBasemap = () => {
        removeLayers(onlineBasemapStyle?.layerIds || []);
        removeSources(onlineBasemapStyle?.sourceIds || []);
    };

    const normalizeBasemapLayerOrder = () => {
        const overlayAnchorLayerId = getOverlayAnchorLayerId();
        try {
            for (const layerId of getActiveBasemapLayerIds()) {
                if (overlayAnchorLayerId && mapEngine.getLayer(layerId)) {
                    mapEngine.moveLayer(layerId, overlayAnchorLayerId);
                }
            }

            const firstBasemapLayerId = getFirstBasemapLayerId();
            if (mapEngine.getLayer(backgroundLayerId)) {
                if (firstBasemapLayerId) mapEngine.moveLayer(backgroundLayerId, firstBasemapLayerId);
                else if (overlayAnchorLayerId) mapEngine.moveLayer(backgroundLayerId, overlayAnchorLayerId);
            }
        } catch {
            // keep current order if MapLibre rejects a move during style changes
        }
    };

    const getBasemapItems = () => createOsmBasemapLayerItems({ mode, theme });
    const getPmtilesLayerVisibility = (item) => (
        shouldUsePmtilesBasemap() ? getLayerVisibility(mode, item.modes) : 'none'
    );

    const applyTheme = (nextTheme) => {
        theme = nextTheme === 'dark' ? 'dark' : 'light';
        const items = getBasemapItems();

        try {
            for (const item of items) {
                const layerId = item.layer.id;
                if (!mapEngine.getLayer(layerId)) continue;
                mapEngine.setLayoutProperty(layerId, 'visibility', getPmtilesLayerVisibility(item));
                Object.entries(item.layer.paint || {}).forEach(([key, value]) => {
                    mapEngine.setPaintProperty(layerId, key, value);
                });
            }
            if (mapEngine.getLayer(backgroundLayerId)) {
                mapEngine.setPaintProperty(backgroundLayerId, 'background-color', getBackgroundColor());
                mapEngine.setPaintProperty(backgroundLayerId, 'background-opacity', 1);
            }
            normalizeBasemapLayerOrder();

            const canvas = mapEngine.getCanvas?.();
            if (canvas?.style) canvas.style.background = getBackgroundColor();
            if (typeof onThemeChanged === 'function') onThemeChanged({ theme, mode });
        } catch {
            // ignore
        }
    };

    const setMode = (nextMode, nextTheme = theme) => {
        mode = normalizeBasemapMode(nextMode);
        try {
            ensureLayers();
        } catch {
            // Layer sync retries when the map style is ready.
        }
        applyTheme(nextTheme);
    };

    const setPmtilesAvailable = (available) => {
        hasPmtilesArchive = available === true;
        if (!hasPmtilesArchive && activeBasemapSourceKind === BASEMAP_SOURCE_PMTILES) {
            activeBasemapSourceKind = 'none';
        }
        try {
            ensureLayers();
            applyTheme(theme);
        } catch {
            // Keep the archive availability state; layer sync retries when the map style is ready.
        }
        return hasPmtilesArchive;
    };

    const setActiveBasemapSource = (sourceKind) => {
        if (sourceKind === BASEMAP_SOURCE_OPENFREEMAP) {
            activeBasemapSourceKind = BASEMAP_SOURCE_OPENFREEMAP;
        } else if (sourceKind === BASEMAP_SOURCE_PMTILES && hasPmtilesArchive) {
            activeBasemapSourceKind = BASEMAP_SOURCE_PMTILES;
        } else {
            activeBasemapSourceKind = 'none';
        }
        try {
            ensureLayers();
            applyTheme(theme);
        } catch {
            // Layer sync retries when the map style is ready.
        }
        return activeBasemapSourceKind;
    };

    const setOnlineBasemapStyle = (descriptor) => {
        cleanupOnlineBasemap();
        onlineBasemapStyle = descriptor?.style ? descriptor : null;
        try {
            ensureLayers();
            applyTheme(theme);
        } catch {
            // Layer sync retries when the map style is ready.
        }
        return onlineBasemapStyle;
    };

    const ensureLayers = () => {
        const items = getBasemapItems();
        const pmtilesProtocolReady = hasPmtilesArchive
            ? mapEngine.ensurePmtilesProtocol?.() === true
            : false;

        if (!hasPmtilesArchive) {
            cleanupPmtilesBasemap();
        }
        if (!shouldUseOnlineBasemap()) {
            cleanupOnlineBasemap();
        }

        if (pmtilesProtocolReady && !mapEngine.getSource(OSM_VECTOR_SOURCE_ID)) {
            mapEngine.addSource(OSM_VECTOR_SOURCE_ID, createOsmBasemapSource(pmtilesUrl));
        }

        const beforeLayerId = getOverlayAnchorLayerId();

        if (!mapEngine.getLayer(backgroundLayerId)) {
            mapEngine.addLayer({
                id: backgroundLayerId,
                type: 'background',
                paint: {
                    'background-color': getBackgroundColor(),
                    'background-opacity': 1
                }
            }, beforeLayerId);
        } else {
            try {
                mapEngine.setPaintProperty(backgroundLayerId, 'background-color', getBackgroundColor());
                mapEngine.setPaintProperty(backgroundLayerId, 'background-opacity', 1);
            } catch {
                // keep existing background paint if MapLibre rejects the update
            }
        }

        for (const item of items) {
            const layer = item.layer;
            if (!hasPmtilesArchive || !mapEngine.getSource(OSM_VECTOR_SOURCE_ID)) continue;
            if (!mapEngine.getLayer(layer.id)) {
                mapEngine.addLayer({
                    ...layer,
                    layout: {
                        ...(layer.layout || {}),
                        visibility: getPmtilesLayerVisibility(item)
                    }
                }, beforeLayerId);
            }
        }

        if (shouldUseOnlineBasemap()) {
            const descriptor = onlineBasemapStyle;
            Object.entries(descriptor.style.sources || {}).forEach(([sourceId, source]) => {
                if (!mapEngine.getSource(sourceId)) mapEngine.addSource(sourceId, source);
            });
            for (const layer of descriptor.style.layers || []) {
                if (!mapEngine.getLayer(layer.id)) {
                    mapEngine.addLayer(layer, beforeLayerId);
                }
            }
        } else {
            cleanupOnlineBasemap();
        }

        normalizeBasemapLayerOrder();
    };

    const getStyle = (options = {}) => {
        const nextMode = normalizeBasemapMode(options.mode || mode);
        const nextTheme = options.theme === 'dark' ? 'dark' : (options.theme === 'light' ? 'light' : theme);
        const forcePmtilesSource = options.sourceKind === BASEMAP_SOURCE_PMTILES;
        if (forcePmtilesSource) {
            if (hasPmtilesArchive) {
                const style = createOsmBasemapStyle({
                    mode: nextMode,
                    theme: nextTheme,
                    pmtilesAvailable: true,
                    pmtilesUrl,
                    ...options
                });
                return {
                    ...style,
                    metadata: {
                        ...(style.metadata || {}),
                        tokyoRailBasemap: {
                            sourceKind: nextMode === 'transparent' ? 'none' : 'pmtiles',
                            primarySourceId: nextMode === 'transparent' ? null : OSM_VECTOR_SOURCE_ID
                        }
                    }
                };
            }
            return createBackgroundBasemapStyle(nextTheme);
        }
        if (
            activeBasemapSourceKind === BASEMAP_SOURCE_OPENFREEMAP
            && nextMode !== 'transparent'
            && onlineBasemapStyle?.style
        ) {
            return createOnlineBasemapExportStyle(onlineBasemapStyle, nextTheme);
        }
        if (hasPmtilesArchive) {
            const style = createOsmBasemapStyle({
                mode: nextMode,
                theme: nextTheme,
                pmtilesAvailable: true,
                pmtilesUrl,
                ...options
            });
            return {
                ...style,
                metadata: {
                    ...(style.metadata || {}),
                    tokyoRailBasemap: {
                        sourceKind: nextMode === 'transparent' ? 'none' : 'pmtiles',
                        primarySourceId: nextMode === 'transparent' ? null : OSM_VECTOR_SOURCE_ID
                    }
                }
            };
        }
        return createBackgroundBasemapStyle(nextTheme);
    };

    return {
        applyTheme,
        ensureLayers,
        getAttributionItems: () => (
            shouldUseOnlineBasemap()
                ? OPENFREEMAP_ATTRIBUTION_ITEMS
                : OSM_BASEMAP_ATTRIBUTION_ITEMS
        ).map((item) => ({ ...item })),
        setPmtilesAvailable,
        setActiveBasemapSource,
        setOnlineBasemapStyle,
        setMode,
        getStyle,
        getExportStyle: getStyle,
        getMode: () => mode,
        getPmtilesAvailable: () => hasPmtilesArchive,
        getActiveBasemapSource: () => activeBasemapSourceKind,
        getOnlineBasemapStyle: () => onlineBasemapStyle,
        getTheme: () => theme
    };
};
