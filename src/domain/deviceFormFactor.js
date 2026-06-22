const toFiniteNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
};

const normalizeText = (value) => String(value ?? '').trim().toLowerCase();

const hasTabletUserAgent = ({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) => {
    const ua = normalizeText(userAgent);
    const platformText = normalizeText(platform);
    if (/\bipad\b/.test(ua) || /\btablet\b/.test(ua)) return true;
    if (/\bandroid\b/.test(ua) && !/\bmobile\b/.test(ua)) return true;
    return /\bmac/.test(platformText) && Number(maxTouchPoints) > 1;
};

const hasFoldableUserAgent = ({ userAgent = '' } = {}) => {
    const ua = normalizeText(userAgent);
    return /\bfold(?:able)?\b|\bpixel fold\b|\bsurface duo\b|\bsm-f9\d{2}\b|\bmoto razr\b/.test(ua);
};

const hasFoldableSegments = ({ viewportSegmentCount = 0 } = {}) => (
    Number(viewportSegmentCount) >= 2
);

const hasNativeTabletScreen = ({ nativePlatform = '', screenWidth = 0, screenHeight = 0 } = {}) => {
    const platform = normalizeText(nativePlatform);
    const screenMin = Math.min(toFiniteNumber(screenWidth), toFiniteNumber(screenHeight));
    return platform === 'ios' && screenMin >= 700;
};

export const resolveDeviceFormFactor = (input = {}) => {
    const viewportWidth = toFiniteNumber(input.viewportWidth);
    const viewportHeight = toFiniteNumber(input.viewportHeight);
    const screenWidth = toFiniteNumber(input.screenWidth);
    const screenHeight = toFiniteNumber(input.screenHeight);

    const maxTouchPoints = Number(input.maxTouchPoints) || 0;
    const hasTouch = (
        maxTouchPoints > 0
        || input.coarsePointer === true
        || input.anyPointerCoarse === true
        || input.hoverNone === true
    );

    const viewportMin = Math.min(viewportWidth || screenWidth, viewportHeight || screenHeight);
    const viewportMax = Math.max(viewportWidth || screenWidth, viewportHeight || screenHeight);
    const screenMin = Math.min(screenWidth || viewportWidth, screenHeight || viewportHeight);
    const screenMax = Math.max(screenWidth || viewportWidth, screenHeight || viewportHeight);

    if (hasFoldableSegments(input) || hasFoldableUserAgent(input)) return 'foldable';

    const largeTouchViewport = hasTouch && viewportMin >= 600 && viewportMax >= 700;
    const largeTouchScreen = hasTouch && screenMin >= 600 && screenMax >= 700;
    if (
        hasNativeTabletScreen(input)
        || hasTabletUserAgent({ ...input, maxTouchPoints })
        || largeTouchViewport
        || largeTouchScreen
    ) {
        return 'tablet';
    }

    if (hasTouch) return 'phone';
    return 'desktop';
};

export const isDesktopLayoutPreferenceAvailable = (input = {}) => {
    const formFactor = resolveDeviceFormFactor(input);
    return formFactor === 'tablet' || formFactor === 'foldable';
};
