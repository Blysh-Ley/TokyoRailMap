import assert from 'node:assert/strict';

import {
    appendDefaultOsmBasemapCacheKey,
    readOsmBasemapRuntimeConfig,
    verifyOsmBasemapArchive
} from '../src/services/osmBasemapConfig.js';
import {
    PMTILES_HEADER_RANGE_END,
    PMTILES_HEADER_RANGE_LENGTH
} from '../src/domain/osmBasemapPackage.js';

const createPmtilesHeaderBytes = (magicBytes = [0x50, 0x4d]) => {
    const bytes = new Uint8Array(PMTILES_HEADER_RANGE_LENGTH);
    bytes.set(magicBytes, 0);
    return bytes;
};

{
    const config = readOsmBasemapRuntimeConfig({ windowRef: {} });
    assert.equal(config.basemapSource, 'pmtiles');
    assert.equal(config.usesPmtilesBasemap, true);
    assert.equal(config.usesOnlineBasemap, false);
    assert.equal(config.pmtilesUrl, './tiles/kanto.pmtiles?pmtiles-cache=header-16384');
    assert.equal(config.basemapPackage.styleUrl, 'pmtiles://./tiles/kanto.pmtiles?pmtiles-cache=header-16384');
    assert.equal(config.basemapPackage.downloadUrl, './tiles/kanto.pmtiles');
    assert.equal(
        appendDefaultOsmBasemapCacheKey('./tiles/kanto.pmtiles?pmtiles-cache=custom'),
        './tiles/kanto.pmtiles?pmtiles-cache=custom'
    );
    assert.equal(
        appendDefaultOsmBasemapCacheKey('./tiles/kanto.pmtiles#download'),
        './tiles/kanto.pmtiles?pmtiles-cache=header-16384#download'
    );
}

{
    const config = readOsmBasemapRuntimeConfig({
        windowRef: {
            TOKYO_RAIL_BASEMAP_SOURCE: 'openfreemap'
        }
    });
    assert.equal(config.basemapSource, 'openfreemap');
    assert.equal(config.usesPmtilesBasemap, false);
    assert.equal(config.usesOnlineBasemap, true);
}

{
    const config = readOsmBasemapRuntimeConfig({
        windowRef: {
            TOKYO_RAIL_OSM_BASEMAP_URL: 'https://cdn.example.test/kanto.pmtiles',
            TOKYO_RAIL_OSM_BASEMAP_DOWNLOAD_URL: '/offline/kanto.pmtiles'
        }
    });

    assert.equal(config.pmtilesUrl, 'https://cdn.example.test/kanto.pmtiles');
    assert.equal(config.basemapPackage.styleUrl, 'pmtiles://https://cdn.example.test/kanto.pmtiles');
    assert.equal(config.basemapPackage.downloadUrl, '/offline/kanto.pmtiles');
}

{
    const createFetch = (bytes, status = 206, contentLength = bytes.byteLength) => async (_url, options = {}) => {
        if (options.method === 'HEAD') {
            return {
                ok: true,
                status: 200,
                headers: {
                    get: (name) => (name === 'Content-Length' ? String(contentLength) : null)
                }
            };
        }
        assert.equal(options.headers.Range, `bytes=0-${PMTILES_HEADER_RANGE_END}`);
        assert.notEqual(options.headers.Range, 'bytes=0-1');
        return {
            ok: status >= 200 && status < 300,
            status,
            headers: {
                get: (name) => (name === 'Content-Length' ? String(contentLength) : null)
            },
            arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        };
    };

    assert.equal(await verifyOsmBasemapArchive({
        fetchFn: createFetch(createPmtilesHeaderBytes()),
        pmtilesUrl: './tiles/kanto.pmtiles'
    }), true);
    assert.equal(await verifyOsmBasemapArchive({
        fetchFn: createFetch(createPmtilesHeaderBytes([0x3c, 0x21]), 206),
        pmtilesUrl: './tiles/kanto.pmtiles'
    }), false);
    assert.equal(await verifyOsmBasemapArchive({
        fetchFn: createFetch(createPmtilesHeaderBytes(), 200, 301674438),
        pmtilesUrl: './tiles/kanto.pmtiles'
    }), false);

    let htmlFallbackRequested = false;
    assert.equal(await verifyOsmBasemapArchive({
        fetchFn: async (_url, options = {}) => {
            if (options.method === 'HEAD') {
                return {
                    ok: true,
                    status: 200,
                    headers: {
                        get: (name) => (name === 'Content-Type' ? 'text/html; charset=utf-8' : null)
                    }
                };
            }
            htmlFallbackRequested = true;
            return null;
        },
        pmtilesUrl: './tiles/kanto.pmtiles'
    }), false);
    assert.equal(htmlFallbackRequested, false);

    assert.equal(await verifyOsmBasemapArchive({
        fetchFn: async (_url, options = {}) => {
            if (options.method === 'HEAD') {
                return {
                    ok: false,
                    status: 405,
                    headers: { get: () => null }
                };
            }
            assert.equal(options.headers.Range, `bytes=0-${PMTILES_HEADER_RANGE_END}`);
            assert.notEqual(options.headers.Range, 'bytes=0-1');
            return {
                ok: true,
                status: 206,
                headers: { get: () => String(PMTILES_HEADER_RANGE_LENGTH) },
                arrayBuffer: async () => createPmtilesHeaderBytes().buffer
            };
        },
        pmtilesUrl: './tiles/kanto.pmtiles'
    }), true);
}

{
    const calls = [];
    const windowRef = {
        Capacitor: {
            getPlatform: () => 'android',
            isNativePlatform: () => true,
            registerPlugin: (name) => {
                assert.equal(name, 'TokyoRailBasemap');
                return {
                    prepare: async () => {
                        calls.push(['prepare']);
                        return { ok: true, size: PMTILES_HEADER_RANGE_LENGTH };
                    },
                    readRange: async ({ offset, length }) => {
                        calls.push(['readRange', offset, length]);
                        return {
                            data: Buffer.from(createPmtilesHeaderBytes()).toString('base64'),
                            offset,
                            length,
                            size: PMTILES_HEADER_RANGE_LENGTH
                        };
                    }
                };
            }
        }
    };

    assert.equal(await verifyOsmBasemapArchive({
        fetchFn: () => {
            throw new Error('Android archive verification should use the native PMTiles reader');
        },
        pmtilesUrl: './tiles/kanto.pmtiles?pmtiles-cache=header-16384',
        windowRef
    }), true);
    assert.deepEqual(calls, [
        ['prepare'],
        ['readRange', 0, PMTILES_HEADER_RANGE_LENGTH]
    ]);
}

console.log('osm basemap config smoke ok');
