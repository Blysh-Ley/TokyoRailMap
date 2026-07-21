import assert from 'node:assert/strict';

import {
    blobToBase64,
    buildNativeExportCachePath,
    getNativeExportPlugins,
    isAndroidNativeExportTarget,
    isIosNativeExportTarget,
    sanitizeNativeExportFilename,
    shareOrSaveImageArtifact,
    shareOrDownloadArtifact
} from '../src/services/nativeExportShareService.js';

{
    assert.equal(sanitizeNativeExportFilename(' route/map:東京?.png '), 'route_map_東京_.png');
    assert.equal(sanitizeNativeExportFilename('...'), 'tokyorail-export');
    assert.match(buildNativeExportCachePath('a/b.pdf', { now: () => 123 }), /^tokyorail-export-123-a_b\.pdf$/);
}

{
    const base64 = await blobToBase64(new Blob(['hello']));
    assert.equal(base64, Buffer.from('hello').toString('base64'));
}

{
    const target = {
        Capacitor: {
            getPlatform: () => 'android',
            isNativePlatform: () => true
        }
    };
    assert.equal(isAndroidNativeExportTarget(target), true);
}

{
    const registered = [];
    const target = {
        Capacitor: {
            getPlatform: () => 'ios',
            isNativePlatform: () => true,
            Plugins: {},
            registerPlugin: (name) => {
                registered.push(name);
                return { pluginName: name };
            }
        }
    };

    assert.equal(isIosNativeExportTarget(target), true);
    assert.deepEqual(getNativeExportPlugins(target), {
        Filesystem: { pluginName: 'Filesystem' },
        Media: { pluginName: 'Media' },
        Share: { pluginName: 'Share' }
    });
    assert.deepEqual(registered, ['Filesystem', 'Media', 'Share']);
}

{
    const calls = [];
    const target = {
        Capacitor: {
            getPlatform: () => 'android',
            isNativePlatform: () => true,
            Plugins: {
                Filesystem: {
                    writeFile: async (options) => calls.push(['writeFile', options]),
                    getUri: async (options) => {
                        calls.push(['getUri', options]);
                        return { uri: `file:///cache/${options.path}` };
                    }
                },
                Share: {
                    canShare: async () => ({ value: true }),
                    share: async (options) => calls.push(['share', options])
                }
            }
        }
    };

    const result = await shareOrDownloadArtifact({
        blob: new Blob(['png']),
        filename: 'trip.png',
        mimeType: 'image/png',
        target
    });

    assert.equal(result.shared, true);
    assert.equal(calls[0][0], 'writeFile');
    assert.equal(calls[0][1].directory, 'CACHE');
    assert.equal(calls[0][1].data, Buffer.from('png').toString('base64'));
    assert.equal(calls[1][0], 'getUri');
    assert.equal(calls[2][0], 'share');
    assert.deepEqual(calls[2][1].files, [result.uri]);
}

{
    let fallbackFilename = '';
    const result = await shareOrDownloadArtifact({
        blob: new Blob(['web']),
        filename: 'web.png',
        target: {},
        fallbackDownload: async (_blob, filename) => {
            fallbackFilename = filename;
        }
    });

    assert.equal(result.fallback, true);
    assert.equal(result.downloaded, true);
    assert.equal(fallbackFilename, 'web.png');
}

{
    let fallbackCalls = 0;
    const target = {
        Capacitor: {
            getPlatform: () => 'android',
            isNativePlatform: () => true,
            Plugins: {
                Filesystem: {
                    writeFile: async () => {
                        throw new Error('write failed');
                    },
                    getUri: async () => ({ uri: 'file:///cache/fail.png' })
                },
                Share: {
                    share: async () => {}
                }
            }
        }
    };

    const result = await shareOrDownloadArtifact({
        blob: new Blob(['fail']),
        filename: 'fail.png',
        target,
        logger: { warn: () => {} },
        fallbackDownload: async () => {
            fallbackCalls += 1;
        }
    });

    assert.equal(result.fallback, true);
    assert.equal(fallbackCalls, 1);
}

{
    const calls = [];
    const target = {
        confirm: () => false,
        Capacitor: {
            getPlatform: () => 'android',
            isNativePlatform: () => true,
            Plugins: {
                Filesystem: {
                    writeFile: async (options) => calls.push(['writeFile', options]),
                    getUri: async (options) => {
                        calls.push(['getUri', options]);
                        return { uri: `file:///cache/${options.path}` };
                    }
                },
                Media: {
                    checkPermissions: async () => ({ photos: 'granted' }),
                    getAlbumsPath: async () => ({ path: '/Pictures' }),
                    getAlbums: async () => ({
                        albums: [{ name: 'TokyoRailMap', identifier: '/Pictures/TokyoRailMap' }]
                    }),
                    savePhoto: async (options) => calls.push(['savePhoto', options])
                },
                Share: {
                    share: async (options) => calls.push(['share', options])
                }
            }
        }
    };

    const result = await shareOrSaveImageArtifact({
        blob: new Blob(['image']),
        filename: 'route.png',
        mimeType: 'image/png',
        target
    });

    assert.equal(result.saved, true);
    assert.equal(result.shared, false);
    assert.deepEqual(calls.map((x) => x[0]), ['writeFile', 'getUri', 'savePhoto']);
    assert.equal(calls[2][1].path, `data:image/png;base64,${Buffer.from('image').toString('base64')}`);
    assert.equal(calls[2][1].albumIdentifier, '/Pictures/TokyoRailMap');
    assert.equal(calls[2][1].fileName, 'route');
}

{
    const calls = [];
    let albumCreated = false;
    const target = {
        confirm: () => true,
        Capacitor: {
            getPlatform: () => 'android',
            isNativePlatform: () => true,
            Plugins: {
                Filesystem: {
                    writeFile: async (options) => calls.push(['writeFile', options]),
                    getUri: async (options) => {
                        calls.push(['getUri', options]);
                        return { uri: `file:///cache/${options.path}` };
                    }
                },
                Media: {
                    checkPermissions: async () => ({ publicStorage13Plus: 'prompt' }),
                    requestPermissions: async () => ({ publicStorage13Plus: 'granted' }),
                    getAlbumsPath: async () => ({ path: '/Pictures' }),
                    getAlbums: async () => ({
                        albums: albumCreated
                            ? [{ name: 'TokyoRailMap', identifier: '/Pictures/TokyoRailMap' }]
                            : []
                    }),
                    createAlbum: async (options) => {
                        albumCreated = true;
                        calls.push(['createAlbum', options]);
                    },
                    savePhoto: async (options) => calls.push(['savePhoto', options])
                },
                Share: {
                    canShare: async () => ({ value: true }),
                    share: async (options) => calls.push(['share', options])
                }
            }
        }
    };

    const result = await shareOrSaveImageArtifact({
        blob: new Blob(['image-share']),
        filename: 'line.png',
        mimeType: 'image/png',
        target
    });

    assert.equal(result.saved, true);
    assert.equal(result.shared, true);
    assert.deepEqual(calls.map((x) => x[0]), ['writeFile', 'getUri', 'createAlbum', 'savePhoto', 'share']);
    assert.equal(calls[2][1].name, 'TokyoRailMap');
    assert.equal(calls[3][1].albumIdentifier, '/Pictures/TokyoRailMap');
    assert.deepEqual(calls[4][1].files, [result.uri]);
}

{
    const calls = [];
    const target = {
        confirm: () => true,
        Capacitor: {
            getPlatform: () => 'ios',
            isNativePlatform: () => true,
            Plugins: {
                Filesystem: {
                    writeFile: async (options) => calls.push(['writeFile', options]),
                    getUri: async (options) => {
                        calls.push(['getUri', options]);
                        return { uri: `file:///cache/${options.path}` };
                    }
                },
                Media: {
                    checkPermissions: async () => {
                        throw new Error('Media.checkPermissions is not implemented');
                    },
                    requestPermissions: async () => {
                        throw new Error('Media.requestPermissions is not implemented');
                    },
                    savePhoto: async (options) => calls.push(['savePhoto', options])
                },
                Share: {
                    canShare: async () => ({ value: true }),
                    share: async (options) => calls.push(['share', options])
                }
            }
        }
    };

    const result = await shareOrSaveImageArtifact({
        blob: new Blob(['ios-image']),
        filename: 'ios-line.png',
        mimeType: 'image/png',
        target
    });

    assert.equal(result.saved, true);
    assert.equal(result.shared, true);
    assert.deepEqual(calls.map((x) => x[0]), ['writeFile', 'getUri', 'savePhoto', 'share']);
    assert.equal(calls[2][1].path, result.uri);
    assert.equal('albumIdentifier' in calls[2][1], false);
    assert.equal('fileName' in calls[2][1], false);
    assert.deepEqual(calls[3][1].files, [result.uri]);
}

{
    const calls = [];
    const target = {
        confirm: () => true,
        Capacitor: {
            getPlatform: () => 'ios',
            isNativePlatform: () => true,
            Plugins: {
                Filesystem: {
                    writeFile: async (options) => calls.push(['writeFile', options]),
                    getUri: async (options) => {
                        calls.push(['getUri', options]);
                        return { uri: `file:///cache/${options.path}` };
                    }
                },
                Media: {
                    savePhoto: async (options) => calls.push(['savePhoto', options])
                },
                Share: {
                    canShare: async () => ({ value: true }),
                    share: async (options) => {
                        calls.push(['share', options]);
                        throw new Error('share cancelled');
                    }
                }
            }
        }
    };

    const result = await shareOrSaveImageArtifact({
        blob: new Blob(['ios-share-cancel']),
        filename: 'ios-share-cancel.png',
        mimeType: 'image/png',
        target,
        logger: { warn: () => {} }
    });

    assert.equal(result.saved, true);
    assert.equal(result.shared, false);
    assert.equal(result.fallback, false);
    assert.equal(calls.filter((x) => x[0] === 'share').length, 1);
    assert.deepEqual(calls.map((x) => x[0]), ['writeFile', 'getUri', 'savePhoto', 'share']);
}

{
    const calls = [];
    const target = {
        Capacitor: {
            getPlatform: () => 'android',
            isNativePlatform: () => true,
            Plugins: {
                Filesystem: {
                    writeFile: async (options) => calls.push(['writeFile', options]),
                    getUri: async (options) => {
                        calls.push(['getUri', options]);
                        return { uri: `file:///cache/${options.path}` };
                    }
                },
                Media: {
                    checkPermissions: async () => ({ photos: 'denied' }),
                    requestPermissions: async () => ({ photos: 'denied' })
                },
                Share: {
                    share: async (options) => calls.push(['share', options])
                }
            }
        }
    };

    const result = await shareOrSaveImageArtifact({
        blob: new Blob(['denied']),
        filename: 'denied.png',
        mimeType: 'image/png',
        target
    });

    assert.equal(result.shared, true);
    assert.equal(result.saved, undefined);
    assert.equal(calls.filter((x) => x[0] === 'writeFile').length, 2);
    assert.equal(calls.at(-1)[0], 'share');
}

console.log('native export share service smoke ok');
