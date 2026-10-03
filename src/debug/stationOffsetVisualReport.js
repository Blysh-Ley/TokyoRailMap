const isNonNegativeNumber = (value) => Number.isFinite(value) && value >= 0;

const isValidSample = (sample) => sample?.status === 'sampled'
    && Number.isFinite(sample.sampledAt)
    && Number.isFinite(sample.zoom)
    && Number.isFinite(sample.stationCount)
    && sample.stationCount > 0
    && isNonNegativeNumber(sample.maxErrorPx);

const round = (value) => Number.isFinite(value)
    ? Math.round(value * 1000) / 1000
    : null;

const summarizeErrorStatistics = (validFrames, tolerance) => {
    const errors = validFrames.map((sample) => sample.maxErrorPx).sort((a, b) => a - b);
    const overToleranceFrameCount = errors.filter((error) => error > tolerance).length;
    return {
        validSampleCount: validFrames.length,
        maxErrorPx: errors.length ? round(errors.at(-1)) : null,
        p95ErrorPx: errors.length ? round(errors[Math.ceil(errors.length * 0.95) - 1]) : null,
        overToleranceFrameCount,
        overToleranceFramePercent: errors.length ? round(overToleranceFrameCount / errors.length * 100) : null
    };
};

// Diagnostic aggregation only: rendered feature coordinates are not a framebuffer
// scan. The reference is current-zoom offset geometry, not the railway centerline.
export function summarizeStationOffsetVisualSamples({
    samples = [],
    zoomEndedAt = null,
    zoomEndZoom = null,
    observedUntil = null,
    tolerancePx = 1,
    observationWindowMs = 2000
} = {}) {
    const frames = (Array.isArray(samples) ? samples : [])
        .filter((sample) => sample && typeof sample === 'object')
        .slice()
        .sort((a, b) => (a.sampledAt ?? Infinity) - (b.sampledAt ?? Infinity));
    const tolerance = isNonNegativeNumber(tolerancePx) ? tolerancePx : 1;
    const validFrames = frames.filter(isValidSample);
    const errorStatistics = summarizeErrorStatistics(validFrames, tolerance);
    const durations = frames.map((sample) => sample.samplingDurationMs).filter(isNonNegativeNumber);
    const worstFrame = validFrames.reduce((worst, sample) => (
        !worst || sample.maxErrorPx > worst.maxErrorPx ? sample : worst
    ), null);
    const hasZoomEnd = Number.isFinite(zoomEndedAt);
    const observationWindow = isNonNegativeNumber(observationWindowMs) ? observationWindowMs : 2000;
    const observedDuration = hasZoomEnd && Number.isFinite(observedUntil) && observedUntil >= zoomEndedAt
        ? observedUntil - zoomEndedAt
        : null;
    const postEndFrames = hasZoomEnd
        ? frames.filter((sample) => Number.isFinite(sample.sampledAt) && sample.sampledAt >= zoomEndedAt)
        : [];
    const matchesFinalZoom = (sample) => isValidSample(sample)
        && Number.isFinite(zoomEndZoom)
        && Math.abs(sample.zoom - zoomEndZoom) <= 0.001;
    const finalFrame = hasZoomEnd ? postEndFrames.at(-1) : frames.at(-1);
    const finalIsObserved = hasZoomEnd ? matchesFinalZoom(finalFrame) : isValidSample(finalFrame);
    const finalErrorPx = finalIsObserved ? round(finalFrame.maxErrorPx) : null;
    let caughtUpAtOrAfterZoomEnd = null;
    let catchUpAfterZoomEndMs = null;
    let finalStatus = hasZoomEnd ? 'unobserved' : 'observing';

    if (hasZoomEnd && finalIsObserved) {
        caughtUpAtOrAfterZoomEnd = finalFrame.maxErrorPx <= tolerance;
        finalStatus = caughtUpAtOrAfterZoomEnd ? 'aligned' : 'lagging';
        if (caughtUpAtOrAfterZoomEnd) {
            let alignedSince = finalFrame.sampledAt;
            for (let index = postEndFrames.length - 2; index >= 0; index -= 1) {
                const sample = postEndFrames[index];
                if (!matchesFinalZoom(sample) || sample.maxErrorPx > tolerance) break;
                alignedSince = sample.sampledAt;
            }
            catchUpAfterZoomEndMs = round(alignedSince - zoomEndedAt);
        }
    }

    return {
        measurement: 'rendered-station-coordinates',
        reference: 'current-zoom-station-offset-geometry',
        scope: 'visible-offset-station-circles',
        framebufferScan: false,
        excludes: ['railway-centerline-error', 'station-labels', 'transfer-capsules'],
        coverage: 'sampled-stations-only',
        statisticsWindow: 'session-including-settling',
        activeZoom: summarizeErrorStatistics(hasZoomEnd
            ? validFrames.filter((sample) => sample.sampledAt <= zoomEndedAt)
            : validFrames, tolerance),
        tolerancePx: tolerance,
        observationWindowMs: observationWindow,
        observedAfterZoomEndMs: round(observedDuration),
        observationComplete: observedDuration != null && observedDuration >= observationWindow,
        lastRenderAfterZoomEndMs: postEndFrames.length
            ? round(postEndFrames.at(-1).sampledAt - zoomEndedAt)
            : null,
        renderSampleCount: frames.length,
        ...errorStatistics,
        unavailableSampleCount: frames.length - validFrames.length,
        maxSamplingDurationMs: durations.length ? round(Math.max(...durations)) : null,
        totalSamplingDurationMs: round(durations.reduce((sum, duration) => sum + duration, 0)),
        truncatedFrameCount: frames.filter((sample) => sample.truncated === true).length,
        worstStationId: worstFrame?.worstStationId ?? null,
        finalErrorPx,
        finalStatus,
        caughtUpAtOrAfterZoomEnd,
        catchUpAfterZoomEndMs
    };
}
