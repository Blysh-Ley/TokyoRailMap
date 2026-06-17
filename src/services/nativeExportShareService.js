const CACHE_DIRECTORY = 'CACHE';
const GLOBAL_API_KEY = 'TokyoRailNativeExportShare';

const toText = (value) => String(value ?? '').trim();

export const sanitizeNativeExportFilename = (filename) => {
    const base = toText(filename)
        .replace(/\s+/g, '_')
        .replace(/[\\/:*?"<>|#%{}^~[\]`]/g, '_')
        .replace(/\.+$/g, '')
        .slice(0, 140);
    return base || 'tokyorail-export';
};

export const buildNativeExportCachePath = (filename, {
    now = Date.now
} = {}) => {
    const stamp = Number(now?.()) || Date.now();
    return `tokyorail-export-${stamp}-${sanitizeNativeExportFilename(filename)}`;
};

export const getCapacitorPlatform = (target = globalThis) => {
    const capacitor = target?.Capacitor;
    try {
        if (typeof capacitor?.getPlatform === 'function') return toText(capacitor.getPlatform()).toLowerCase();
    } catch {
        // ignore broken platform probes and fall through
    }
    return toText(capacitor?.platform).toLowerCase();
};

export const isAndroidNativeExportTarget = (target = globalThis) => {
    const capacitor = target?.Capacitor;
    if (!capacitor) return false;

    const platform = getCapacitorPlatform(target);
    if (platform !== 'android') return false;

    try {
        if (typeof capacitor.isNativePlatform === 'function') return capacitor.isNativePlatform() === true;
    } catch {
        return false;
    }

    return true;
};

export const getNativeExportPlugins = (target = globalThis) => {
    const capacitor = target?.Capacitor;
    const plugins = capacitor?.Plugins || {};
    return {
        Filesystem: plugins.Filesystem || capacitor?.Filesystem || target?.Filesystem || null,
        Share: plugins.Share || capacitor?.Share || target?.Share || null
    };
};

const uint8ArrayToBase64 = (bytes) => {
    const BufferCtor = globalThis.Buffer;
    if (BufferCtor?.from) return BufferCtor.from(bytes).toString('base64');

    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    return globalThis.btoa(binary);
};

export const blobToBase64 = async (blob) => {
    if (!blob) throw new Error('missing export blob');
    if (typeof blob.arrayBuffer === 'function') {
        const buffer = await blob.arrayBuffer();
        return uint8ArrayToBase64(new Uint8Array(buffer));
    }

    const FileReaderCtor = globalThis.FileReader;
    if (!FileReaderCtor) throw new Error('Blob arrayBuffer/FileReader is unavailable');

    return await new Promise((resolve, reject) => {
        const reader = new FileReaderCtor();
        reader.addEventListener('load', () => {
            const result = toText(reader.result);
            const commaIndex = result.indexOf(',');
            resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
        }, { once: true });
        reader.addEventListener('error', () => reject(reader.error || new Error('failed to read export blob')), { once: true });
        reader.readAsDataURL(blob);
    });
};

const runFallbackDownload = async ({ blob, filename, fallbackDownload }) => {
    if (typeof fallbackDownload === 'function') {
        await fallbackDownload(blob, filename);
        return { shared: false, downloaded: true, fallback: true };
    }
    return { shared: false, downloaded: false, fallback: true };
};

export const shareOrDownloadArtifact = async ({
    blob,
    filename,
    mimeType,
    title = 'TokyoRailMap',
    dialogTitle = '分享导出文件',
    fallbackDownload,
    target = globalThis,
    logger = console
} = {}) => {
    const safeFilename = sanitizeNativeExportFilename(filename);
    if (!isAndroidNativeExportTarget(target)) {
        return await runFallbackDownload({ blob, filename: safeFilename, fallbackDownload });
    }

    const { Filesystem, Share } = getNativeExportPlugins(target);
    if (
        typeof Filesystem?.writeFile !== 'function'
        || typeof Filesystem?.getUri !== 'function'
        || typeof Share?.share !== 'function'
    ) {
        return await runFallbackDownload({ blob, filename: safeFilename, fallbackDownload });
    }

    try {
        if (typeof Share.canShare === 'function') {
            const canShare = await Share.canShare();
            if (canShare?.value === false) {
                return await runFallbackDownload({ blob, filename: safeFilename, fallbackDownload });
            }
        }

        const path = buildNativeExportCachePath(safeFilename);
        const data = await blobToBase64(blob);
        await Filesystem.writeFile({
            path,
            data,
            directory: CACHE_DIRECTORY,
            recursive: true
        });
        const uriResult = await Filesystem.getUri({
            path,
            directory: CACHE_DIRECTORY
        });
        const uri = toText(uriResult?.uri);
        if (!uri) throw new Error('Filesystem.getUri returned an empty uri');

        await Share.share({
            title: toText(title) || safeFilename,
            text: safeFilename,
            files: [uri],
            dialogTitle: toText(dialogTitle) || '分享导出文件'
        });

        return {
            shared: true,
            downloaded: false,
            fallback: false,
            filename: safeFilename,
            mimeType: toText(mimeType),
            uri
        };
    } catch (error) {
        logger?.warn?.('[native-export] native share failed; falling back to browser download', error);
        return await runFallbackDownload({ blob, filename: safeFilename, fallbackDownload });
    }
};

export const installNativeExportShareGlobal = (target = globalThis) => {
    if (!target) return null;
    const api = Object.freeze({
        blobToBase64,
        buildNativeExportCachePath,
        getCapacitorPlatform,
        getNativeExportPlugins,
        isAndroidNativeExportTarget,
        sanitizeNativeExportFilename,
        shareOrDownloadArtifact
    });
    target[GLOBAL_API_KEY] = api;
    return api;
};

if (typeof globalThis !== 'undefined') {
    installNativeExportShareGlobal(globalThis);
    if (globalThis.window && globalThis.window !== globalThis) {
        installNativeExportShareGlobal(globalThis.window);
    }
}
