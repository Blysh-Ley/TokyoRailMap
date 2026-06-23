import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();

const localDataFetch = async (input) => {
    const raw = typeof input === 'string' ? input : input?.url;
    const url = new URL(raw, window.location.href);
    const rel = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    const body = await readFile(path.join(root, rel));
    return new Response(body, {
        status: 200,
        headers: { 'content-type': 'application/json' }
    });
};

globalThis.window = {
    location: { href: 'http://tokyo-rail-map.local/index.html' },
    fetch: localDataFetch
};
globalThis.fetch = localDataFetch;

const { loadRailGeoDataFromDataFolder } = await import(pathToFileURL(path.join(root, 'src/lib/data.js')).href);

const { stationsGeoJSON, alternateLineMembership } = await loadRailGeoDataFromDataFolder();
const featureById = new Map(
    (Array.isArray(stationsGeoJSON?.features) ? stationsGeoJSON.features : [])
        .map((feature) => [String(feature?.properties?.id || ''), feature])
        .filter(([id]) => id)
);

assert.ok(
    alternateLineMembership?.fullAlternateLineIds?.has?.('Seibu.S-Yurakucho'),
    'runtime data should expose full-line alternate membership'
);
assert.equal(
    featureById.has('Seibu.S-Yurakucho.Iidabashi'),
    false,
    'hidden alternate station feature should not be loaded as its own platform'
);

const kasukabe = featureById.get('Tobu.TobuSkytree.Kasukabe');
assert.ok(kasukabe, 'alternate Kasukabe platform should remain available');
assert.equal(
    (kasukabe.properties?.serving_ids || []).includes('Tobu.Nikko'),
    false,
    'alternate source line should be removed from the visible station membership'
);

const omiya = featureById.get('JR-East.Utsunomiya.Omiya');
assert.ok(omiya, 'alternate Omiya platform should remain available');
assert.equal(
    (omiya.properties?.serving_ids || []).includes('Tobu.JRTobuConnection'),
    false,
    'full-line alternate connection should be removed from station membership'
);

console.log('alternate membership runtime data smoke ok');
