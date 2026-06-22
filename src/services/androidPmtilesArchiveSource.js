import {
    DEFAULT_OSM_BASEMAP_PMTILES_URL,
    hasPmtilesMagicNumber,
    PMTILES_HEADER_RANGE_LENGTH
} from '../domain/osmBasemapPackage.js';

const PLUGIN_NAME = 'TokyoRailBasemap';
let pluginProxy = null;
let preparePromise = null;

const toText = (value) => String(value ?? '').trim();

export const isAndroidNativePmtilesTarget = (target = globalThis) => {
    const capacitor = target?.Capacitor;
    if (!capacitor) return false;

    let platform = '';
    try {
        platform = typeof capacitor.getPlatform === 'function'
            ? toText(capacitor.getPlatform()).toLowerCase()
            : toText(capacitor.platform).toLowerCase();
    } catch {
        return false;
    }
    if (platform !== 'android') return false;

    try {
        if (typeof capacitor.isNativePlatform === 'function') {
            return capacitor.isNativePlatform() === true;
        }
    } catch {
        return false;
    }
    return true;
};

const getCapacitorPluginProxy = (target = globalThis) => {
    const capacitor = target?.Capacitor;
    const existing = capacitor?.Plugins?.[PLUGIN_NAME] || capacitor?.[PLUGIN_NAME] || target?.[PLUGIN_NAME] || null;
    if (existing) return existing;
    if (pluginProxy) return pluginProxy;
    if (typeof capacitor?.registerPlugin !== 'function') return null;

    try {
        pluginProxy = capacitor.registerPlugin(PLUGIN_NAME);
        return pluginProxy;
    } catch {
        return null;
    }
};

export const shouldUseAndroidNativePmtiles = ({
    url = DEFAULT_OSM_BASEMAP_PMTILES_URL,
    target = globalThis
} = {}) => {
    if (!isAndroidNativePmtilesTarget(target)) return false;
    const value = toText(url).replace(/[?#].*$/g, '');
    return value === DEFAULT_OSM_BASEMAP_PMTILES_URL || value.endsWith('/tiles/kanto.pmtiles');
};

export const prepareAndroidPmtilesArchive = async ({
    target = globalThis
} = {}) => {
    const plugin = getCapacitorPluginProxy(target);
    if (typeof plugin?.prepare !== 'function') return null;
    if (!preparePromise) {
        preparePromise = Promise.resolve(plugin.prepare()).catch((error) => {
            preparePromise = null;
            throw error;
        });
    }
    return preparePromise;
};

const base64ToArrayBuffer = (base64) => {
    const text = toText(base64);
    if (!text) return new ArrayBuffer(0);

    const BufferCtor = globalThis.Buffer;
    if (BufferCtor?.from) {
        const buffer = BufferCtor.from(text, 'base64');
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }

    const binary = globalThis.atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
};

export const readAndroidPmtilesRange = async ({
    offset = 0,
    length = PMTILES_HEADER_RANGE_LENGTH,
    target = globalThis
} = {}) => {
    const plugin = getCapacitorPluginProxy(target);
    if (typeof plugin?.readRange !== 'function') return null;

    await prepareAndroidPmtilesArchive({ target });
    const result = await plugin.readRange({
        offset: Number(offset),
        length: Number(length)
    });
    return {
        data: base64ToArrayBuffer(result?.data),
        contentRange: toText(result?.contentRange),
        size: Number(result?.size || 0),
        length: Number(result?.length || 0)
    };
};

export const verifyAndroidPmtilesArchive = async ({
    target = globalThis
} = {}) => {
    try {
        const range = await readAndroidPmtilesRange({
            offset: 0,
            length: PMTILES_HEADER_RANGE_LENGTH,
            target
        });
        return hasPmtilesMagicNumber(range?.data);
    } catch {
        return false;
    }
};
