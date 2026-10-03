import { createStationOffsetVisualSampler } from './stationOffsetVisualSampler.js';

// Submitted source positions are insufficient for labels: sample the native
// anchor attributes used by glyph/background meshes or the DOM transform.
export function createStationLabelAnchorVisualSampler(options = {}) {
    const { mapEngine } = options;
    const sample = createStationOffsetVisualSampler({ ...options,
        getRenderedStationCircles: () => mapEngine?.getRenderedStationLabelAnchors?.() || [] });
    return () => ({ ...sample(), scope: 'visible-offset-station-label-anchors',
        measurement: 'native-symbol-buffer-and-dom-transform',
        excludes: ['glyph-shaping', 'collision-selection', 'railway-centerline-error'], framebufferScan: false });
}
