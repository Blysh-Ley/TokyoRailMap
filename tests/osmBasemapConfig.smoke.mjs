import assert from 'node:assert/strict';

import {
    readOsmBasemapRuntimeConfig,
    verifyOsmBasemapArchive
} from '../src/services/osmBasemapConfig.js';

{
    const config = readOsmBasemapRuntimeConfig({ windowRef: {} });
    assert.equal(config.pmtilesUrl, './tiles/kanto.pmtiles');
    assert.equal(config.basemapPackage.styleUrl, 'pmtiles://./tiles/kanto.pmtiles');
    assert.equal(config.basemapPackage.downloadUrl, './tiles/kanto.pmtiles');
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
        assert.equal(options.headers.Range, 'bytes=0-1');
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
        fetchFn: createFetch(new Uint8Array([0x50, 0x4d])),
        pmtilesUrl: './tiles/kanto.pmtiles'
    }), true);
    assert.equal(await verifyOsmBasemapArchive({
        fetchFn: createFetch(new TextEncoder().encode('<!doctype html>'), 200, 15),
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
            assert.equal(options.headers.Range, 'bytes=0-1');
            return {
                ok: true,
                status: 206,
                headers: { get: () => '2' },
                arrayBuffer: async () => new Uint8Array([0x50, 0x4d]).buffer
            };
        },
        pmtilesUrl: './tiles/kanto.pmtiles'
    }), true);
}

console.log('osm basemap config smoke ok');
