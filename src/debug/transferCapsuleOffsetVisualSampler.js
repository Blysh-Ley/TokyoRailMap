import { createStationOffsetVisualSampler } from './stationOffsetVisualSampler.js';

// Independent entry point: only endpoints from a completed render are sampled.
// Virtual preview nodes have a different reference and are outside this report.
export function createTransferCapsuleOffsetVisualSampler(options = {}) {
    const { mapEngine } = options;
    const sample = createStationOffsetVisualSampler({ ...options,
        getRenderedStationCircles: () => {
            const records = mapEngine?.getRenderedTransferCapsules?.();
            const canvas = mapEngine?.getCanvas?.();
            if (Array.isArray(records)) return records.flatMap((record) => record.endpoints
                .filter((endpoint) => endpoint.screenPoint.x >= 0 && endpoint.screenPoint.x <= canvas?.clientWidth
                    && endpoint.screenPoint.y >= 0 && endpoint.screenPoint.y <= canvas?.clientHeight)
                .map((endpoint) => ({
                type: 'Feature', properties: { id: endpoint.stationId },
                geometry: { type: 'Point', coordinates: endpoint.coordinates },
                screenPoint: endpoint.screenPoint, renderedZoom: record.renderedZoom
            })));
            if (!mapEngine?.hasLayer?.('transfer-capsule-dot-layer')) return [];
            return mapEngine.queryRenderedFeatures({ layers: ['transfer-capsule-dot-layer'] }).map((feature) => ({
                ...feature, properties: { ...feature.properties, id: feature.properties.stationId }
            }));
        }
    });
    return () => ({ ...sample(), scope: 'visible-offset-capsule-endpoints',
        coverage: 'real-offset-station-endpoints-only', framebufferScan: false });
}
