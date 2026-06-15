export const DEFAULT_MOBILE_SHEET_PEEK_PX = 86;
const MOBILE_SHEET_SAMPLE_WINDOW_MS = 120;
const MOBILE_SHEET_FAST_VELOCITY_PX_PER_MS = 0.75;
const MOBILE_SHEET_STRONG_VELOCITY_PX_PER_MS = 1.45;
const MOBILE_SHEET_JITTER_MOVE_PX = 24;
const MOBILE_SHEET_JITTER_VELOCITY_PX_PER_MS = 0.35;
const MOBILE_SHEET_PROJECT_MS = 180;
const MOBILE_SHEET_STRONG_PROJECT_RATIO = 0.28;
const MOBILE_SHEET_SLOW_ADJACENT_RATIO = 0.3;
const MOBILE_SHEET_STATE_ORDER = ['expanded', 'half', 'collapsed'];

const toPositiveNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

const now = () => (
    typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()
);

const toFiniteNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

export const normalizeMobileSheetState = (state) => {
    if (state === 'half') return 'half';
    if (state === 'collapsed') return 'collapsed';
    return 'expanded';
};

export const getMobileSheetSnapPoints = ({
    height = 0,
    peekPx = DEFAULT_MOBILE_SHEET_PEEK_PX
} = {}) => {
    const h = Math.max(1, Math.round(toPositiveNumber(height, 1)));
    const peek = Math.max(48, Math.min(h, Math.round(toPositiveNumber(peekPx, DEFAULT_MOBILE_SHEET_PEEK_PX))));
    const collapsed = Math.max(0, h - peek);
    return {
        expanded: 0,
        half: Math.max(0, Math.min(collapsed, Math.round(h * 0.5))),
        collapsed
    };
};

export const getMobileSheetOffsetForState = (state, options = {}) => {
    const normalized = normalizeMobileSheetState(state);
    return getMobileSheetSnapPoints(options)[normalized];
};

export const clampMobileSheetOffset = (offset, options = {}) => {
    const points = getMobileSheetSnapPoints(options);
    return Math.max(points.expanded, Math.min(points.collapsed, Number(offset) || 0));
};

export const getNearestMobileSheetStateByOffset = (offset, options = {}) => {
    const points = getMobileSheetSnapPoints(options);
    const value = clampMobileSheetOffset(offset, options);
    return Object.entries(points)
        .map(([state, point]) => ({ state, distance: Math.abs(point - value) }))
        .sort((a, b) => {
            if (a.distance !== b.distance) return a.distance - b.distance;
            return points[a.state] - points[b.state];
        })[0]?.state || 'expanded';
};

const getAdjacentMobileSheetState = (state, direction) => {
    const index = MOBILE_SHEET_STATE_ORDER.indexOf(normalizeMobileSheetState(state));
    const nextIndex = direction > 0
        ? Math.min(MOBILE_SHEET_STATE_ORDER.length - 1, index + 1)
        : Math.max(0, index - 1);
    return MOBILE_SHEET_STATE_ORDER[nextIndex] || normalizeMobileSheetState(state);
};

const getMobileSheetStateDistance = (fromState, toState, options = {}) => {
    const points = getMobileSheetSnapPoints(options);
    return Math.abs(points[normalizeMobileSheetState(toState)] - points[normalizeMobileSheetState(fromState)]);
};

const addDragSample = (session, sample) => {
    const t = toFiniteNumber(sample?.t, now());
    const y = toFiniteNumber(sample?.y, session.startY);
    session.samples.push({ t, y });
    const minT = t - MOBILE_SHEET_SAMPLE_WINDOW_MS;
    while (session.samples.length > 2 && session.samples[0].t < minT) {
        session.samples.shift();
    }
};

const getDragVelocityY = (session) => {
    const samples = session.samples || [];
    if (samples.length < 2) return 0;
    const last = samples[samples.length - 1];
    let first = samples[0];
    for (const sample of samples) {
        if ((last.t - sample.t) <= MOBILE_SHEET_SAMPLE_WINDOW_MS) {
            first = sample;
            break;
        }
    }
    const dt = last.t - first.t;
    if (!Number.isFinite(dt) || dt <= 0) return 0;
    return (last.y - first.y) / dt;
};

export const createMobileSheetDragSession = ({
    startY = 0,
    startOffset = 0,
    startState = 'expanded',
    height = 0,
    peekPx = DEFAULT_MOBILE_SHEET_PEEK_PX,
    nowMs
} = {}) => {
    const options = { height, peekPx };
    const t = toFiniteNumber(nowMs, now());
    const y = toFiniteNumber(startY, 0);
    const offset = clampMobileSheetOffset(startOffset, options);
    return {
        height: Math.max(1, Math.round(toPositiveNumber(height, 1))),
        peekPx,
        startY: y,
        currentY: y,
        startOffset: offset,
        currentOffset: offset,
        startState: normalizeMobileSheetState(startState),
        samples: [{ t, y }]
    };
};

export const updateMobileSheetDragSession = (session, {
    clientY = session?.currentY ?? 0,
    nowMs
} = {}) => {
    if (!session) return null;
    const options = { height: session.height, peekPx: session.peekPx };
    const y = toFiniteNumber(clientY, session.currentY);
    session.currentY = y;
    session.currentOffset = clampMobileSheetOffset(
        session.startOffset + (y - session.startY),
        options
    );
    addDragSample(session, { t: nowMs, y });
    return session;
};

export const resolveMobileSheetDragTarget = (session, {
    clientY = session?.currentY ?? 0,
    nowMs,
    cancelled = false
} = {}) => {
    if (!session) return 'expanded';
    if (cancelled) return normalizeMobileSheetState(session.startState);

    updateMobileSheetDragSession(session, { clientY, nowMs });
    const options = { height: session.height, peekPx: session.peekPx };
    const currentOffset = clampMobileSheetOffset(session.currentOffset, options);
    const startState = normalizeMobileSheetState(session.startState);
    const totalDeltaY = session.currentY - session.startY;
    const absDeltaY = Math.abs(totalDeltaY);
    const velocityY = getDragVelocityY(session);
    const absVelocityY = Math.abs(velocityY);
    const direction = velocityY !== 0 ? Math.sign(velocityY) : Math.sign(totalDeltaY);

    if (absDeltaY < MOBILE_SHEET_JITTER_MOVE_PX && absVelocityY < MOBILE_SHEET_JITTER_VELOCITY_PX_PER_MS) {
        return startState;
    }

    const projectedDelta = velocityY * MOBILE_SHEET_PROJECT_MS;
    const projectedOffset = clampMobileSheetOffset(currentOffset + projectedDelta, options);
    const strongFling = absVelocityY >= MOBILE_SHEET_STRONG_VELOCITY_PX_PER_MS
        || Math.abs(projectedDelta) >= session.height * MOBILE_SHEET_STRONG_PROJECT_RATIO;
    if (strongFling && direction !== 0) {
        return getNearestMobileSheetStateByOffset(projectedOffset, options);
    }

    if (absVelocityY >= MOBILE_SHEET_FAST_VELOCITY_PX_PER_MS
        && absDeltaY >= MOBILE_SHEET_JITTER_MOVE_PX
        && direction !== 0) {
        const nearestProjected = getNearestMobileSheetStateByOffset(projectedOffset, options);
        if (nearestProjected !== startState) return nearestProjected;
        return getAdjacentMobileSheetState(startState, direction);
    }

    const nearestCurrent = getNearestMobileSheetStateByOffset(currentOffset, options);
    if (nearestCurrent !== startState) return nearestCurrent;

    if (direction !== 0) {
        const adjacent = getAdjacentMobileSheetState(startState, direction);
        if (adjacent !== startState) {
            const adjacentDistance = getMobileSheetStateDistance(startState, adjacent, options);
            if (adjacentDistance > 0 && absDeltaY >= adjacentDistance * MOBILE_SHEET_SLOW_ADJACENT_RATIO) {
                return adjacent;
            }
        }
    }

    return startState;
};
