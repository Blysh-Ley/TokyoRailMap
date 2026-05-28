export const APPEARANCE_STORAGE_KEY = 'tokyorail.appearance.mode';
export const BASEMAP_STORAGE_KEY = 'tokyorail.basemap.mode';
export const AUTO_UPDATE_CHECK_STORAGE_KEY = 'tokyorail.auto.update.check.enabled';
export const TIMETABLE_VIEW_STORAGE_KEY = 'tokyorail.timetable.view.mode';
export const HOVER_PREVIEW_STORAGE_KEY = 'tokyorail.hover.preview.enabled';
export const ADAPTIVE_VIEWPORT_STORAGE_KEY = 'tokyorail.adaptive.viewport.enabled';
export const STATION_OFFSET_MODE_STORAGE_KEY = 'tokyorail.station.offset.mode';

const getLocalStorageValue = (key, fallback) => {
    try {
        return window.localStorage.getItem(key) ?? fallback;
    } catch {
        return fallback;
    }
};

const setLocalStorageValue = (key, value) => {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // ignore
    }
};

const getSystemTheme = () => (
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
);

export const readAppearanceMode = () => {
    const raw = String(getLocalStorageValue(APPEARANCE_STORAGE_KEY, 'system')).trim();
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
    return 'system';
};

export const writeAppearanceMode = (mode) => {
    const next = (mode === 'light' || mode === 'dark' || mode === 'system') ? mode : 'system';
    setLocalStorageValue(APPEARANCE_STORAGE_KEY, next);
    return next;
};

export const resolveThemeFromAppearance = (mode) => {
    if (mode === 'dark') return 'dark';
    if (mode === 'light') return 'light';
    return getSystemTheme();
};

export const readBasemapMode = () => {
    const raw = String(getLocalStorageValue(BASEMAP_STORAGE_KEY, 'carto')).trim().toLowerCase();
    if (raw === 'carto' || raw === 'ost' || raw === 'transparent') return raw;
    return 'carto';
};

export const writeBasemapMode = (mode) => {
    const next = (mode === 'carto' || mode === 'ost' || mode === 'transparent') ? mode : 'carto';
    setLocalStorageValue(BASEMAP_STORAGE_KEY, next);
    return next;
};

export const readAutoUpdateCheckEnabled = () => {
    const raw = String(getLocalStorageValue(AUTO_UPDATE_CHECK_STORAGE_KEY, '1')).trim().toLowerCase();
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
    return true;
};

export const writeAutoUpdateCheckEnabled = (enabled) => {
    const next = enabled !== false;
    setLocalStorageValue(AUTO_UPDATE_CHECK_STORAGE_KEY, next ? '1' : '0');
    return next;
};

export const readTimetableViewMode = () => {
    const raw = String(getLocalStorageValue(TIMETABLE_VIEW_STORAGE_KEY, 'list')).trim();
    if (raw === 'list' || raw === 'grid') return raw;
    return 'list';
};

export const writeTimetableViewMode = (mode) => {
    const next = mode === 'grid' ? 'grid' : 'list';
    setLocalStorageValue(TIMETABLE_VIEW_STORAGE_KEY, next);
    return next;
};

export const readHoverPreviewEnabled = () => {
    const raw = String(getLocalStorageValue(HOVER_PREVIEW_STORAGE_KEY, '1')).trim().toLowerCase();
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
    return true;
};

export const writeHoverPreviewEnabled = (enabled) => {
    const next = enabled !== false;
    setLocalStorageValue(HOVER_PREVIEW_STORAGE_KEY, next ? '1' : '0');
    return next;
};

export const readAdaptiveViewportEnabled = () => {
    const raw = String(getLocalStorageValue(ADAPTIVE_VIEWPORT_STORAGE_KEY, '1')).trim().toLowerCase();
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
    return true;
};

export const writeAdaptiveViewportEnabled = (enabled) => {
    const next = enabled !== false;
    setLocalStorageValue(ADAPTIVE_VIEWPORT_STORAGE_KEY, next ? '1' : '0');
    return next;
};

export const readStationOffsetMode = () => {
    const raw = String(getLocalStorageValue(STATION_OFFSET_MODE_STORAGE_KEY, 'dynamic')).trim().toLowerCase();
    if (raw === 'dynamic' || raw === 'performance') return raw;
    return 'dynamic';
};

export const writeStationOffsetMode = (mode) => {
    const next = String(mode || '').trim().toLowerCase() === 'performance' ? 'performance' : 'dynamic';
    setLocalStorageValue(STATION_OFFSET_MODE_STORAGE_KEY, next);
    return next;
};
