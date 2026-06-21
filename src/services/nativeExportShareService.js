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
    return isNativeCapacitorPlatform(target, 'android');
};

export const isIosNativeExportTarget = (target = globalThis) => {
    return isNativeCapacitorPlatform(target, 'ios');
};

const isNativeCapacitorPlatform = (target, expectedPlatform = '') => {
    const capacitor = target?.Capacitor;
    if (!capacitor) return false;

    const platform = getCapacitorPlatform(target);
    if (platform !== expectedPlatform) return false;

    try {
        if (typeof capacitor.isNativePlatform === 'function') return capacitor.isNativePlatform() === true;
    } catch {
        return false;
    }

    return true;
};

const isNativeShareTarget = (target = globalThis) => (
    isAndroidNativeExportTarget(target) || isIosNativeExportTarget(target)
);

const isNativeImageSaveTarget = (target = globalThis) => (
    isAndroidNativeExportTarget(target) || isIosNativeExportTarget(target)
);

const getCapacitorPluginProxy = (target, name) => {
    const capacitor = target?.Capacitor;
    const plugins = capacitor?.Plugins || {};
    const existing = plugins[name] || capacitor?.[name] || target?.[name] || null;
    if (existing) return existing;

    if (typeof capacitor?.registerPlugin !== 'function') return null;
    try {
        return capacitor.registerPlugin(name);
    } catch {
        return null;
    }
};

export const getNativeExportPlugins = (target = globalThis) => {
    return {
        Filesystem: getCapacitorPluginProxy(target, 'Filesystem'),
        Media: getCapacitorPluginProxy(target, 'Media'),
        Share: getCapacitorPluginProxy(target, 'Share')
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

const writeBlobToNativeCache = async ({ Filesystem, blob, filename }) => {
    const path = buildNativeExportCachePath(filename);
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
    return { data, path, uri };
};

const filenameWithoutExtension = (filename) => {
    const safeFilename = sanitizeNativeExportFilename(filename);
    return safeFilename.replace(/\.[^.]*$/g, '') || 'tokyorail-export';
};

const buildImageDataUri = ({ data, mimeType }) => {
    const base64 = toText(data);
    if (!base64) throw new Error('missing image data');
    const type = /^image\//i.test(toText(mimeType)) ? toText(mimeType) : 'image/png';
    return `data:${type};base64,${base64}`;
};

const shareNativeFile = async ({
    Share,
    uri,
    filename,
    title = 'TokyoRailMap',
    dialogTitle = '分享导出文件'
}) => {
    if (typeof Share?.canShare === 'function') {
        const canShare = await Share.canShare();
        if (canShare?.value === false) throw new Error('native share is unavailable');
    }
    await Share.share({
        title: toText(title) || filename,
        text: filename,
        files: [uri],
        dialogTitle: toText(dialogTitle) || '分享导出文件'
    });
};

const isPermissionGranted = (value) => {
    const v = toText(value).toLowerCase();
    return v === 'granted' || v === 'limited';
};

const callPermissionMethod = async (method, platform) => {
    if (typeof method !== 'function') return null;
    if (platform === 'ios') {
        try {
            return await method({ permission: 'addOnly' });
        } catch {
            // Some plugin versions expose permission methods without options.
        }
    }
    try {
        return await method();
    } catch {
        return null;
    }
};

const requestImageGalleryPermission = async (Media, { platform = '' } = {}) => {
    if (!Media) return false;
    const readStatus = async () => {
        try {
            return await callPermissionMethod(Media.checkPermissions?.bind(Media), platform);
        } catch {
            return null;
        }
    };
    const hasGrant = (status) => {
        if (!status || typeof status !== 'object') return false;
        return [
            status.photos,
            status.photo,
            status.images,
            status.media,
            status.addOnly,
            status.readWrite,
            status.storage,
            status.publicStorage,
            status.publicStorage13Plus
        ].some(isPermissionGranted);
    };

    const initial = await readStatus();
    if (hasGrant(initial)) return true;

    if (typeof Media.requestPermissions !== 'function') return true;
    const requested = await callPermissionMethod(Media.requestPermissions.bind(Media), platform);
    if (!requested) return true;
    return hasGrant(requested);
};

const getNativeMediaAlbums = async (Media) => {
    if (typeof Media?.getAlbums !== 'function') return [];
    const response = await Media.getAlbums();
    return Array.isArray(response?.albums) ? response.albums : [];
};

const getAndroidAlbumsPath = async (Media) => {
    if (typeof Media?.getAlbumsPath !== 'function') return '';
    try {
        return toText((await Media.getAlbumsPath())?.path);
    } catch {
        return '';
    }
};

const findNativeMediaAlbum = (albums, name, androidAlbumsPath = '') => {
    const targetName = toText(name);
    const pathPrefix = toText(androidAlbumsPath);
    return albums.find((album) => {
        if (toText(album?.name) !== targetName) return false;
        if (!pathPrefix) return true;
        return toText(album?.identifier).startsWith(pathPrefix);
    }) || albums.find((album) => toText(album?.name) === targetName) || null;
};

const ensureNativeMediaAlbumIdentifier = async (Media, albumName) => {
    const name = toText(albumName) || 'TokyoRailMap';
    const androidAlbumsPath = await getAndroidAlbumsPath(Media);
    const existing = findNativeMediaAlbum(await getNativeMediaAlbums(Media), name, androidAlbumsPath);
    if (existing?.identifier) return existing.identifier;

    if (typeof Media?.createAlbum === 'function') {
        await Media.createAlbum({ name });
        const created = findNativeMediaAlbum(await getNativeMediaAlbums(Media), name, androidAlbumsPath);
        if (created?.identifier) return created.identifier;
    }

    return '';
};

const saveNativeImageToGallery = async ({
    Media,
    data,
    uri,
    filename,
    mimeType,
    album = 'TokyoRailMap',
    platform = ''
}) => {
    if (!Media) throw new Error('Media plugin is unavailable');
    const path = platform === 'ios' && toText(uri)
        ? toText(uri)
        : buildImageDataUri({ data, mimeType });
    if (!path) throw new Error('missing image file uri');
    const albumIdentifier = platform === 'ios' ? '' : await ensureNativeMediaAlbumIdentifier(Media, album);
    const fileName = platform === 'ios' ? '' : filenameWithoutExtension(filename);

    const options = {
        path,
        ...(fileName ? { fileName } : {}),
        ...(albumIdentifier ? { albumIdentifier } : {})
    };

    if (typeof Media.savePhoto === 'function') {
        return await Media.savePhoto(options);
    }
    if (typeof Media.saveImage === 'function') {
        return await Media.saveImage(options);
    }
    if (typeof Media.saveToGallery === 'function') {
        return await Media.saveToGallery(options);
    }

    throw new Error('Media plugin has no supported image save method');
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
    if (!isNativeShareTarget(target)) {
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
        const { uri } = await writeBlobToNativeCache({ Filesystem, blob, filename: safeFilename });
        await shareNativeFile({ Share, uri, filename: safeFilename, title, dialogTitle });

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

export const shareOrSaveImageArtifact = async ({
    blob,
    filename,
    mimeType = 'image/png',
    title = 'TokyoRailMap',
    dialogTitle = '分享图片',
    savedPrompt = '图片已保存到本地相册。是否继续分享？',
    fallbackDownload,
    target = globalThis,
    logger = console
} = {}) => {
    const safeFilename = sanitizeNativeExportFilename(filename);
    if (!/^image\//i.test(toText(mimeType))) {
        return await shareOrDownloadArtifact({
            blob,
            filename: safeFilename,
            mimeType,
            title,
            dialogTitle,
            fallbackDownload,
            target,
            logger
        });
    }
    if (!isNativeImageSaveTarget(target)) {
        return await runFallbackDownload({ blob, filename: safeFilename, fallbackDownload });
    }

    const platform = getCapacitorPlatform(target);
    const { Filesystem, Media, Share } = getNativeExportPlugins(target);
    if (
        typeof Filesystem?.writeFile !== 'function'
        || typeof Filesystem?.getUri !== 'function'
    ) {
        return await runFallbackDownload({ blob, filename: safeFilename, fallbackDownload });
    }

    try {
        const { data, uri } = await writeBlobToNativeCache({ Filesystem, blob, filename: safeFilename });
        const canSave = await requestImageGalleryPermission(Media, { platform });
        if (!canSave) {
            return await shareOrDownloadArtifact({
                blob,
                filename: safeFilename,
                mimeType,
                title,
                dialogTitle,
                fallbackDownload,
                target,
                logger
            });
        }

        await saveNativeImageToGallery({
            Media,
            data,
            uri,
            filename: safeFilename,
            mimeType,
            platform
        });
        const shouldShare = typeof target?.confirm === 'function'
            ? target.confirm(toText(savedPrompt) || '图片已保存到本地相册。是否继续分享？')
            : false;
        if (shouldShare && typeof Share?.share === 'function') {
            try {
                await shareNativeFile({ Share, uri, filename: safeFilename, title, dialogTitle });
                return {
                    saved: true,
                    shared: true,
                    downloaded: false,
                    fallback: false,
                    filename: safeFilename,
                    mimeType: toText(mimeType),
                    uri
                };
            } catch (shareError) {
                logger?.warn?.('[native-export] optional native image share was cancelled or failed after save', shareError);
                return {
                    saved: true,
                    shared: false,
                    downloaded: false,
                    fallback: false,
                    filename: safeFilename,
                    mimeType: toText(mimeType),
                    uri
                };
            }
        }

        return {
            saved: true,
            shared: false,
            downloaded: false,
            fallback: false,
            filename: safeFilename,
            mimeType: toText(mimeType),
            uri
        };
    } catch (error) {
        logger?.warn?.('[native-export] native image save failed; falling back to share/download', error);
        return await shareOrDownloadArtifact({
            blob,
            filename: safeFilename,
            mimeType,
            title,
            dialogTitle,
            fallbackDownload,
            target,
            logger
        });
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
        isIosNativeExportTarget,
        sanitizeNativeExportFilename,
        shareOrSaveImageArtifact,
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
